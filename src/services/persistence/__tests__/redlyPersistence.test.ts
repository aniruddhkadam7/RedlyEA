/**
 * Redly Portable Repository Persistence Tests
 *
 * Validates the full `.Redly` file format:
 * 1. Save → Load → equality (round-trip)
 * 2. Large repository stress test (5000+ elements, 10000+ relations)
 * 3. Corrupted file error handling
 * 4. Version mismatch handling
 * 5. Integrity validation (orphan relationships, duplicate IDs)
 */

import { EaRepository } from '@/pages/dependency-view/utils/eaRepository';
import { buildRedlyFile, type RedlyExportSource } from '@/services/persistence/redlyExportService';
import { parseRedlyFile } from '@/services/persistence/redlyImportService';
import { checkAndMigrateVersion } from '@/services/persistence/redlyMigration';
import { validateRepositoryData } from '@/services/persistence/redlyValidation';
import { REDLY_FORMAT_VERSION, type RedlyDiagramData, type RedlyPackage } from '@/services/persistence/redlyTypes';
import { zipSync, strToU8 } from 'fflate';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_METADATA: Record<string, unknown> = {
  repositoryName: 'redly-test-repo',
  organizationName: 'Test Org',
  architectureScope: 'Enterprise',
  referenceFramework: 'Custom',
  governanceMode: 'Advisory',
  lifecycleCoverage: 'As-Is',
  timeHorizon: 'Current',
  owner: { userId: 'test-user', displayName: 'Test User' },
  createdAt: new Date().toISOString(),
  frameworkConfig: {
    custom: {
      enabledObjectTypes: [
        'Enterprise', 'Application', 'Technology', 'Capability',
        'BusinessService', 'BusinessProcess', 'Department', 'Database',
      ],
      enabledRelationshipTypes: [
        'OWNS', 'DEPLOYED_ON', 'USES', 'DEPENDS_ON', 'SERVED_BY',
        'INTEGRATES_WITH', 'COMPOSED_OF', 'DECOMPOSES_TO', 'REALIZES',
      ],
    },
  },
};

const makeView = (id: string, name: string): RedlyDiagramData => ({
  id,
  name,
  description: `View ${name}`,
  viewpointId: 'application-landscape',
  scope: { kind: 'EntireRepository' },
  layoutMetadata: {},
  createdAt: new Date().toISOString(),
  createdBy: 'test-user',
  status: 'SAVED',
});

const buildTestSource = (
  objects: { id: string; type: string; attributes: Record<string, unknown> }[],
  relationships: { id: string; fromId: string; toId: string; type: string; attributes?: Record<string, unknown> }[],
  views: RedlyDiagramData[] = [],
  viewLayouts: Record<string, Record<string, { x: number; y: number }>> = {},
): RedlyExportSource => ({
  repositoryMetadata: { ...TEST_METADATA },
  objects: objects.map((o) => ({ ...o, attributes: { ...o.attributes } })),
  relationships: relationships.map((r) => ({
    id: r.id,
    fromId: r.fromId,
    toId: r.toId,
    type: r.type,
    attributes: { ...(r.attributes ?? {}) },
  })),
  views,
  viewLayouts,
  designWorkspaces: [],
  baselines: [],
  importHistory: [],
  versionHistory: [],
  schemaVersion: '1',
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ===========================================================================
// ROUND-TRIP TESTS
// ===========================================================================

describe('Redly Round-Trip Persistence', () => {
  test('save small repo → load → deep compare equality', async () => {
    const objects = [
      { id: 'ent-1', type: 'Enterprise', attributes: { name: 'Acme Corp' } },
      { id: 'app-1', type: 'Application', attributes: { name: 'CRM System', version: '2.0' } },
      { id: 'app-2', type: 'Application', attributes: { name: 'ERP System', deployed: true } },
      { id: 'tech-1', type: 'Technology', attributes: { name: 'PostgreSQL' } },
    ];
    const relationships = [
      { id: 'rel-1', fromId: 'ent-1', toId: 'app-1', type: 'OWNS' },
      { id: 'rel-2', fromId: 'app-1', toId: 'tech-1', type: 'DEPLOYED_ON' },
      { id: 'rel-3', fromId: 'app-2', toId: 'tech-1', type: 'DEPLOYED_ON' },
    ];
    const views = [makeView('view-1', 'Application Landscape')];
    const viewLayouts = {
      'view-1': {
        'app-1': { x: 100, y: 200 },
        'app-2': { x: 300, y: 400 },
      },
    };

    const source = buildTestSource(objects, relationships, views, viewLayouts);

    // Export
    const exportResult = await buildRedlyFile(source);
    expect(exportResult.ok).toBe(true);
    if (!exportResult.ok) return;
    expect(exportResult.bytes.length).toBeGreaterThan(0);
    expect(exportResult.metadata.formatVersion).toBe(REDLY_FORMAT_VERSION);

    // Import
    const importResult = await parseRedlyFile(exportResult.bytes);
    expect(importResult.ok).toBe(true);
    if (!importResult.ok) return;

    const pkg = importResult.data;

    // Verify metadata
    expect(pkg.metadata.formatVersion).toBe(REDLY_FORMAT_VERSION);
    expect(pkg.metadata.schemaVersion).toBe('1');
    // crypto.subtle is not available in jsdom, so checksum may be empty
    if (globalThis.crypto?.subtle) {
      expect(pkg.metadata.checksum).toBeTruthy();
    }

    // Verify elements
    expect(pkg.repository.objects).toHaveLength(4);
    const app1 = pkg.repository.objects.find((o) => o.id === 'app-1');
    expect(app1).toBeTruthy();
    expect(app1!.type).toBe('Application');
    expect(app1!.attributes.name).toBe('CRM System');
    expect(app1!.attributes.version).toBe('2.0');

    // Verify relationships
    expect(pkg.repository.relationships).toHaveLength(3);
    const rel2 = pkg.repository.relationships.find((r) => r.id === 'rel-2');
    expect(rel2).toBeTruthy();
    expect(rel2!.fromId).toBe('app-1');
    expect(rel2!.toId).toBe('tech-1');
    expect(rel2!.type).toBe('DEPLOYED_ON');

    // Verify diagrams
    expect(pkg.diagrams).toHaveLength(1);
    expect(pkg.diagrams[0].id).toBe('view-1');
    expect(pkg.diagrams[0].name).toBe('Application Landscape');

    // Verify layouts
    expect(pkg.layouts['view-1']).toBeTruthy();
    expect(pkg.layouts['view-1']['app-1']).toEqual({ x: 100, y: 200 });
    expect(pkg.layouts['view-1']['app-2']).toEqual({ x: 300, y: 400 });

    // Verify repository metadata
    expect(pkg.repository.metadata).toBeTruthy();
    expect((pkg.repository.metadata as any).repositoryName).toBe('redly-test-repo');
  });

  test('save with EaRepository.export → round-trip via EaRepository.import', async () => {
    // Build live repository
    const repo = new EaRepository();
    repo.addObject({ id: 'ent-1', type: 'Enterprise', attributes: { name: 'Corp' } });
    repo.addObject({ id: 'app-1', type: 'Application', attributes: { name: 'App A' } });
    repo.addRelationship({ id: 'rel-1', fromId: 'ent-1', toId: 'app-1', type: 'OWNS' });

    const exported = repo.export();

    const source = buildTestSource(
      exported.objects as any,
      exported.relationships as any,
      [makeView('v1', 'Test View')],
      { v1: { 'app-1': { x: 10, y: 20 } } },
    );

    // Export to .Redly
    const exportRes = await buildRedlyFile(source);
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;

    // Import from .Redly
    const importRes = await parseRedlyFile(exportRes.bytes);
    expect(importRes.ok).toBe(true);
    if (!importRes.ok) return;

    // Reconstruct EaRepository
    const restoredRepo = EaRepository.import({
      objects: importRes.data.repository.objects.map((o) => ({
        id: o.id,
        type: o.type as any,
        workspaceId: o.workspaceId,
        attributes: o.attributes,
      })),
      relationships: importRes.data.repository.relationships.map((r) => ({
        id: r.id,
        fromId: r.fromId,
        toId: r.toId,
        type: r.type as any,
        attributes: r.attributes,
      })),
    });

    expect(restoredRepo.ok).toBe(true);
    if (!restoredRepo.ok) return;

    expect(restoredRepo.repo.objects.size).toBe(2);
    expect(restoredRepo.repo.objects.get('ent-1')?.type).toBe('Enterprise');
    expect(restoredRepo.repo.objects.get('app-1')?.type).toBe('Application');

    const rels = restoredRepo.repo.getRelationshipsByType('OWNS' as any);
    expect(rels.length).toBe(1);
    expect(rels[0].fromId).toBe('ent-1');
    expect(rels[0].toId).toBe('app-1');
  });

  test('attributes survive round-trip (complex values)', async () => {
    const complexAttrs = {
      name: 'Complex App',
      tags: ['critical', 'production'],
      config: { nested: { deep: true }, count: 42 },
      nullableField: null,
      emptyString: '',
      unicode: 'こんにちは',
    };

    const source = buildTestSource(
      [{ id: 'app-1', type: 'Application', attributes: complexAttrs }],
      [],
    );

    const exportRes = await buildRedlyFile(source);
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;

    const importRes = await parseRedlyFile(exportRes.bytes);
    expect(importRes.ok).toBe(true);
    if (!importRes.ok) return;

    const restored = importRes.data.repository.objects[0];
    expect(restored.attributes.name).toBe('Complex App');
    expect(restored.attributes.tags).toEqual(['critical', 'production']);
    expect((restored.attributes.config as any).nested.deep).toBe(true);
    expect(restored.attributes.nullableField).toBeNull();
    expect(restored.attributes.emptyString).toBe('');
    expect(restored.attributes.unicode).toBe('こんにちは');
  });

  test('multiple diagrams and layouts round-trip correctly', async () => {
    const objects = [
      { id: 'app-1', type: 'Application', attributes: { name: 'A' } },
      { id: 'app-2', type: 'Application', attributes: { name: 'B' } },
      { id: 'app-3', type: 'Application', attributes: { name: 'C' } },
    ];
    const views = [
      makeView('view-a', 'View Alpha'),
      makeView('view-b', 'View Beta'),
      makeView('view-c', 'View Gamma'),
    ];
    const layouts = {
      'view-a': { 'app-1': { x: 0, y: 0 }, 'app-2': { x: 100, y: 100 } },
      'view-b': { 'app-2': { x: 50, y: 50 }, 'app-3': { x: 200, y: 200 } },
      'view-c': { 'app-1': { x: 10, y: 10 } },
    };

    const source = buildTestSource(objects, [], views, layouts);

    const exportRes = await buildRedlyFile(source);
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;

    const importRes = await parseRedlyFile(exportRes.bytes);
    expect(importRes.ok).toBe(true);
    if (!importRes.ok) return;

    expect(importRes.data.diagrams).toHaveLength(3);
    expect(importRes.data.diagrams.map((d) => d.id).sort()).toEqual(
      ['view-a', 'view-b', 'view-c'],
    );

    expect(Object.keys(importRes.data.layouts).sort()).toEqual(
      ['view-a', 'view-b', 'view-c'],
    );
    expect(importRes.data.layouts['view-b']['app-3']).toEqual({ x: 200, y: 200 });
  });

  test('design workspaces and baselines survive round-trip', async () => {
    const source = buildTestSource(
      [{ id: 'ent-1', type: 'Enterprise', attributes: { name: 'Corp' } }],
      [],
    );
    source.designWorkspaces = [
      { id: 'ws-1', name: 'Draft A', stagedElements: [], stagedRelationships: [] },
    ];
    source.baselines = [
      { id: 'bl-1', name: 'Baseline v1', createdAt: new Date().toISOString() },
    ];
    source.importHistory = [{ file: 'test.csv', date: new Date().toISOString() }];
    source.versionHistory = [{ version: 1, date: new Date().toISOString() }];

    const exportRes = await buildRedlyFile(source);
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;

    const importRes = await parseRedlyFile(exportRes.bytes);
    expect(importRes.ok).toBe(true);
    if (!importRes.ok) return;

    expect(importRes.data.repository.designWorkspaces).toHaveLength(1);
    expect((importRes.data.repository.designWorkspaces[0] as any).id).toBe('ws-1');
    expect(importRes.data.repository.baselines).toHaveLength(1);
    expect((importRes.data.repository.baselines[0] as any).id).toBe('bl-1');
    expect(importRes.data.repository.importHistory).toHaveLength(1);
    expect(importRes.data.repository.versionHistory).toHaveLength(1);
  });
});

// ===========================================================================
// LARGE REPOSITORY STRESS TEST
// ===========================================================================

describe('Redly Large Repository Stress Test', () => {
  test('5000 elements + 10000 relationships → round-trip integrity', async () => {
    const objects: { id: string; type: string; attributes: Record<string, unknown> }[] = [];
    const relationships: { id: string; fromId: string; toId: string; type: string }[] = [];

    // Generate elements
    const types = ['Application', 'Technology', 'Capability', 'BusinessService'];
    for (let i = 0; i < 5000; i++) {
      objects.push({
        id: `obj-${i}`,
        type: types[i % types.length],
        attributes: { name: `Element ${i}`, index: i },
      });
    }

    // Generate relationships — each has a unique (type, fromId, toId) triple
    // to avoid duplicate relationship key rejection in EaRepository
    const relTypes = ['USES', 'DEPENDS_ON', 'DEPLOYED_ON', 'INTEGRATES_WITH'];
    for (let i = 0; i < 10000; i++) {
      const fromIdx = Math.floor(i / 2) % 5000;
      const toIdx = (fromIdx + 1 + Math.floor(i / 10000)) % 5000;
      relationships.push({
        id: `rel-${i}`,
        fromId: `obj-${fromIdx}`,
        toId: `obj-${toIdx}`,
        type: relTypes[i % relTypes.length],
      });
    }

    const source = buildTestSource(objects, relationships);

    // Export
    const exportRes = await buildRedlyFile(source);
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;

    // File should be a valid ZIP
    expect(exportRes.bytes[0]).toBe(0x50); // P
    expect(exportRes.bytes[1]).toBe(0x4b); // K

    // Import
    const importRes = await parseRedlyFile(exportRes.bytes);
    expect(importRes.ok).toBe(true);
    if (!importRes.ok) return;

    // Verify counts
    expect(importRes.data.repository.objects).toHaveLength(5000);
    expect(importRes.data.repository.relationships).toHaveLength(10000);

    // Verify a sample element
    const sample = importRes.data.repository.objects.find((o) => o.id === 'obj-42');
    expect(sample).toBeTruthy();
    expect(sample!.attributes.name).toBe('Element 42');
    expect(sample!.attributes.index).toBe(42);

    // Verify a sample relationship
    const sampleRel = importRes.data.repository.relationships.find((r) => r.id === 'rel-0');
    expect(sampleRel).toBeTruthy();
    expect(sampleRel!.fromId).toBe('obj-0');
    expect(sampleRel!.toId).toBe('obj-1');

    // Verify data counts match (EaRepository.import is tested separately;
    // the stress test focuses on ZIP round-trip fidelity at scale)
    expect(importRes.data.repository.objects).toHaveLength(5000);
    expect(importRes.data.repository.relationships).toHaveLength(10000);

    // Spot-check a few more random indices
    const obj999 = importRes.data.repository.objects.find((o) => o.id === 'obj-999');
    expect(obj999).toBeTruthy();
    expect(obj999!.attributes.index).toBe(999);
  });
});

// ===========================================================================
// ERROR HANDLING TESTS
// ===========================================================================

describe('Redly Error Handling', () => {
  test('empty file → proper error', async () => {
    const result = await parseRedlyFile(new Uint8Array(0));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Empty file');
  });

  test('non-ZIP file → proper error', async () => {
    const result = await parseRedlyFile(new Uint8Array([0x00, 0x01, 0x02, 0x03]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not a valid .Redly archive');
  });

  test('corrupted ZIP → proper error', async () => {
    // Valid ZIP header but garbage content
    const badZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0xff]);
    const result = await parseRedlyFile(badZip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  test('ZIP without metadata.json → proper error', async () => {
    const archive = zipSync({
      'repository.json': [strToU8('{}'), { level: 0 }],
    });

    const result = await parseRedlyFile(archive);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('missing metadata.json');
  });

  test('ZIP without repository.json → proper error', async () => {
    const archive = zipSync({
      'metadata.json': [
        strToU8(JSON.stringify({
          formatVersion: REDLY_FORMAT_VERSION,
          appVersion: '6.0.0',
          schemaVersion: '1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          checksum: '',
        })),
        { level: 0 },
      ],
    });

    const result = await parseRedlyFile(archive);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('missing repository.json');
  });

  test('invalid metadata schema → proper error', async () => {
    const archive = zipSync({
      'metadata.json': [strToU8(JSON.stringify({ noVersion: true })), { level: 0 }],
      'repository.json': [strToU8(JSON.stringify({ objects: [], relationships: [] })), { level: 0 }],
    });

    const result = await parseRedlyFile(archive);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('formatVersion');
  });

  test('invalid repository schema → proper error', async () => {
    const archive = zipSync({
      'metadata.json': [
        strToU8(JSON.stringify({
          formatVersion: REDLY_FORMAT_VERSION,
          appVersion: '6.0.0',
          schemaVersion: '1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          checksum: '',
        })),
        { level: 0 },
      ],
      'repository.json': [strToU8(JSON.stringify({ noObjects: true })), { level: 0 }],
    });

    const result = await parseRedlyFile(archive);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('objects');
  });

  test('orphan relationships → block save', async () => {
    const source = buildTestSource(
      [{ id: 'app-1', type: 'Application', attributes: { name: 'A' } }],
      [{ id: 'rel-1', fromId: 'app-1', toId: 'missing-id', type: 'USES' }],
    );

    const result = await buildRedlyFile(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('missing target element');
  });

  test('duplicate element IDs → block save', async () => {
    const source = buildTestSource(
      [
        { id: 'app-1', type: 'Application', attributes: { name: 'A' } },
        { id: 'app-1', type: 'Application', attributes: { name: 'B' } },
      ],
      [],
    );

    const result = await buildRedlyFile(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Duplicate element');
  });

  test('duplicate relationship IDs → block save', async () => {
    const source = buildTestSource(
      [
        { id: 'app-1', type: 'Application', attributes: { name: 'A' } },
        { id: 'app-2', type: 'Application', attributes: { name: 'B' } },
      ],
      [
        { id: 'rel-1', fromId: 'app-1', toId: 'app-2', type: 'USES' },
        { id: 'rel-1', fromId: 'app-2', toId: 'app-1', type: 'USES' },
      ],
    );

    const result = await buildRedlyFile(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Duplicate relationship');
  });

  test('orphan relationships in imported file → block import', async () => {
    const archive = zipSync({
      'metadata.json': [
        strToU8(JSON.stringify({
          formatVersion: REDLY_FORMAT_VERSION,
          appVersion: '6.0.0',
          schemaVersion: '1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          checksum: '',
        })),
        { level: 0 },
      ],
      'repository.json': [
        strToU8(JSON.stringify({
          metadata: {},
          objects: [{ id: 'a', type: 'Application', attributes: {} }],
          relationships: [{ id: 'r1', fromId: 'a', toId: 'missing', type: 'USES', attributes: {} }],
          designWorkspaces: [],
          baselines: [],
          importHistory: [],
          versionHistory: [],
        })),
        { level: 0 },
      ],
    });

    const result = await parseRedlyFile(archive);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('missing target element');
  });
});

// ===========================================================================
// VERSION MIGRATION TESTS
// ===========================================================================

describe('Redly Version Migration', () => {
  test('current version → no migration needed', () => {
    const pkg: RedlyPackage = {
      metadata: {
        formatVersion: REDLY_FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        appVersion: '6.0.0',
        schemaVersion: '1',
        checksum: '',
      },
      repository: {
        metadata: {},
        objects: [],
        relationships: [],
        designWorkspaces: [],
        baselines: [],
        importHistory: [],
        versionHistory: [],
      },
      diagrams: [],
      layouts: {},
    };

    const { result } = checkAndMigrateVersion(pkg);
    expect(result.status).toBe('current');
  });

  test('future version → incompatible error', () => {
    const pkg: RedlyPackage = {
      metadata: {
        formatVersion: '99.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        appVersion: '99.0.0',
        schemaVersion: '1',
        checksum: '',
      },
      repository: {
        metadata: {},
        objects: [],
        relationships: [],
        designWorkspaces: [],
        baselines: [],
        importHistory: [],
        versionHistory: [],
      },
      diagrams: [],
      layouts: {},
    };

    const { result } = checkAndMigrateVersion(pkg);
    expect(result.status).toBe('incompatible');
    if (result.status !== 'incompatible') return;
    expect(result.error).toContain('99.0.0');
    expect(result.error).toContain('update the application');
  });

  test('invalid version → incompatible error', () => {
    const pkg: RedlyPackage = {
      metadata: {
        formatVersion: 'not-a-version',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        appVersion: '6.0.0',
        schemaVersion: '1',
        checksum: '',
      },
      repository: {
        metadata: {},
        objects: [],
        relationships: [],
        designWorkspaces: [],
        baselines: [],
        importHistory: [],
        versionHistory: [],
      },
      diagrams: [],
      layouts: {},
    };

    const { result } = checkAndMigrateVersion(pkg);
    expect(result.status).toBe('incompatible');
  });

  test('future version file → import blocked', async () => {
    const archive = zipSync({
      'metadata.json': [
        strToU8(JSON.stringify({
          formatVersion: '99.0.0',
          appVersion: '99.0.0',
          schemaVersion: '1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          checksum: '',
        })),
        { level: 0 },
      ],
      'repository.json': [
        strToU8(JSON.stringify({
          metadata: {},
          objects: [],
          relationships: [],
          designWorkspaces: [],
          baselines: [],
          importHistory: [],
          versionHistory: [],
        })),
        { level: 0 },
      ],
    });

    const result = await parseRedlyFile(archive);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('99.0.0');
  });
});

// ===========================================================================
// VALIDATION TESTS
// ===========================================================================

describe('Redly Validation', () => {
  test('valid data → no errors', () => {
    const result = validateRepositoryData({
      objects: [
        { id: 'a', type: 'Application', attributes: {} },
        { id: 'b', type: 'Technology', attributes: {} },
      ],
      relationships: [
        { id: 'r1', fromId: 'a', toId: 'b', type: 'USES', attributes: {} },
      ],
      diagrams: [makeView('v1', 'Test')],
      layouts: { v1: { a: { x: 0, y: 0 } } },
    });

    expect(result.ok).toBe(true);
  });

  test('missing element ID → error', () => {
    const result = validateRepositoryData({
      objects: [{ id: '', type: 'Application', attributes: {} }],
      relationships: [],
      diagrams: [],
      layouts: {},
    });

    expect(result.ok).toBe(false);
  });

  test('missing relationship type → error', () => {
    const result = validateRepositoryData({
      objects: [
        { id: 'a', type: 'Application', attributes: {} },
        { id: 'b', type: 'Technology', attributes: {} },
      ],
      relationships: [
        { id: 'r1', fromId: 'a', toId: 'b', type: '', attributes: {} },
      ],
      diagrams: [],
      layouts: {},
    });

    expect(result.ok).toBe(false);
  });

  test('layout for missing diagram → warning', () => {
    const result = validateRepositoryData({
      objects: [{ id: 'a', type: 'Application', attributes: {} }],
      relationships: [],
      diagrams: [],
      layouts: { 'nonexistent-view': { a: { x: 0, y: 0 } } },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('nonexistent-view');
  });
});

// ===========================================================================
// CHECKSUM INTEGRITY TESTS
// ===========================================================================

describe('Redly Checksum', () => {
  test('checksum is computed and consistent', async () => {
    const source = buildTestSource(
      [{ id: 'app-1', type: 'Application', attributes: { name: 'A' } }],
      [],
    );

    const res1 = await buildRedlyFile(source);
    const res2 = await buildRedlyFile(source);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    if (!res1.ok || !res2.ok) return;

    // Same source → same checksum (deterministic serialization)
    expect(res1.metadata.checksum).toBe(res2.metadata.checksum);
    // In jsdom, crypto.subtle may not be available (sha256Hex returns ''),
    // so checksum may be empty. In real browser/Node 20+ it will be 64 hex chars.
    if (globalThis.crypto?.subtle) {
      expect(res1.metadata.checksum).toBeTruthy();
      expect(res1.metadata.checksum.length).toBe(64); // SHA-256 hex
    }
  });

  test('tampered repository.json → checksum warning (when crypto.subtle available)', async () => {
    // In jsdom, crypto.subtle is typically unavailable so sha256Hex returns ''.
    // This test validates the behavior when crypto IS available.
    const source = buildTestSource(
      [{ id: 'app-1', type: 'Application', attributes: { name: 'A' } }],
      [],
    );

    const exportRes = await buildRedlyFile(source);
    expect(exportRes.ok).toBe(true);
    if (!exportRes.ok) return;

    // Tamper with the ZIP: re-create with same metadata but different repository
    const archive = zipSync({
      'metadata.json': [
        strToU8(JSON.stringify(exportRes.metadata)),
        { level: 0 },
      ],
      'repository.json': [
        strToU8(JSON.stringify({
          metadata: {},
          objects: [{ id: 'tampered', type: 'Application', attributes: { name: 'Tampered' } }],
          relationships: [],
          designWorkspaces: [],
          baselines: [],
          importHistory: [],
          versionHistory: [],
        })),
        { level: 0 },
      ],
    });

    const importRes = await parseRedlyFile(archive);
    expect(importRes.ok).toBe(true); // Still loads (checksum is warning, not block)
    if (!importRes.ok) return;

    // Checksum warning only appears if crypto.subtle is available
    if (globalThis.crypto?.subtle) {
      expect(importRes.warnings.length).toBeGreaterThan(0);
      expect(importRes.warnings.some((w) => w.includes('Checksum'))).toBe(true);
    }
  });
});
