/**
 * Redly Validation Service
 *
 * Pre-save and pre-load validation logic.
 * Ensures referential integrity, no duplicate IDs, and structural correctness.
 * Never trusts file data blindly.
 */

import type {
  RedlyDiagramData,
  RedlyElement,
  RedlyLayoutData,
  RedlyRelationship,
  RedlyRepositoryData,
  RedlyValidationResult,
} from './redlyTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const findDuplicates = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return Array.from(dupes);
};

// ---------------------------------------------------------------------------
// Validate repository data (used before export AND before import)
// ---------------------------------------------------------------------------

export const validateRepositoryData = (args: {
  objects: RedlyElement[];
  relationships: RedlyRelationship[];
  diagrams: RedlyDiagramData[];
  layouts: Record<string, RedlyLayoutData>;
}): RedlyValidationResult => {
  const errors: string[] = [];
  const elementIds = new Set(args.objects.map((e) => e.id));

  // --- Element checks ---
  const duplicateElementIds = findDuplicates(args.objects.map((e) => e.id));
  if (duplicateElementIds.length > 0) {
    errors.push(
      `Duplicate element IDs: ${duplicateElementIds.slice(0, 10).join(', ')}${duplicateElementIds.length > 10 ? ` (+${duplicateElementIds.length - 10} more)` : ''}`,
    );
  }

  for (const obj of args.objects) {
    if (!obj.id || typeof obj.id !== 'string') {
      errors.push('Element missing required "id" field.');
    }
    if (!obj.type || typeof obj.type !== 'string') {
      errors.push(`Element ${obj.id ?? '(unknown)'} missing required "type" field.`);
    }
  }

  // --- Relationship checks ---
  const relationshipIds = args.relationships.map((r) => r.id);
  const duplicateRelIds = findDuplicates(relationshipIds);
  if (duplicateRelIds.length > 0) {
    errors.push(
      `Duplicate relationship IDs: ${duplicateRelIds.slice(0, 10).join(', ')}${duplicateRelIds.length > 10 ? ` (+${duplicateRelIds.length - 10} more)` : ''}`,
    );
  }

  for (const rel of args.relationships) {
    if (!rel.id || typeof rel.id !== 'string') {
      errors.push('Relationship missing required "id" field.');
    }
    if (!rel.fromId || typeof rel.fromId !== 'string') {
      errors.push(`Relationship ${rel.id ?? '(unknown)'} missing "fromId".`);
    }
    if (!rel.toId || typeof rel.toId !== 'string') {
      errors.push(`Relationship ${rel.id ?? '(unknown)'} missing "toId".`);
    }
    if (!rel.type || typeof rel.type !== 'string') {
      errors.push(`Relationship ${rel.id ?? '(unknown)'} missing "type".`);
    }
    if (rel.fromId && !elementIds.has(rel.fromId)) {
      errors.push(
        `Relationship ${rel.id} references missing source element: ${rel.fromId}`,
      );
    }
    if (rel.toId && !elementIds.has(rel.toId)) {
      errors.push(
        `Relationship ${rel.id} references missing target element: ${rel.toId}`,
      );
    }
  }

  // --- Diagram checks ---
  const diagramIds = args.diagrams.map((d) => d.id);
  const duplicateDiagramIds = findDuplicates(diagramIds);
  if (duplicateDiagramIds.length > 0) {
    errors.push(
      `Duplicate diagram IDs: ${duplicateDiagramIds.slice(0, 10).join(', ')}`,
    );
  }

  const diagramIdSet = new Set(diagramIds);
  for (const diagram of args.diagrams) {
    if (!diagram.id || typeof diagram.id !== 'string') {
      errors.push('Diagram missing required "id" field.');
    }
  }

  // --- Layout checks ---
  const warnings: string[] = [];
  for (const [viewId, positions] of Object.entries(args.layouts)) {
    if (!diagramIdSet.has(viewId)) {
      warnings.push(`Layout references missing diagram: ${viewId}`);
    }
    for (const elementId of Object.keys(positions)) {
      if (!elementIds.has(elementId)) {
        warnings.push(
          `Layout for view ${viewId} references missing element: ${elementId}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, warnings };
};

// ---------------------------------------------------------------------------
// Validate JSON structure (for import)
// ---------------------------------------------------------------------------

export const validateRedlyMetadataStructure = (
  data: unknown,
): string | null => {
  if (!data || typeof data !== 'object') {
    return 'metadata.json is not a valid object.';
  }
  const meta = data as Record<string, unknown>;

  if (typeof meta.formatVersion !== 'string') {
    return 'metadata.json missing required "formatVersion" field.';
  }
  if (typeof meta.appVersion !== 'string') {
    return 'metadata.json missing required "appVersion" field.';
  }
  if (typeof meta.schemaVersion !== 'string') {
    return 'metadata.json missing required "schemaVersion" field.';
  }
  return null;
};

export const validateRedlyRepositoryStructure = (
  data: unknown,
): string | null => {
  if (!data || typeof data !== 'object') {
    return 'repository.json is not a valid object.';
  }
  const repo = data as Record<string, unknown>;

  if (!Array.isArray(repo.objects)) {
    return 'repository.json missing required "objects" array.';
  }
  if (!Array.isArray(repo.relationships)) {
    return 'repository.json missing required "relationships" array.';
  }
  return null;
};
