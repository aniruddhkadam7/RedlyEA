import type { ArchitectureDecisionRecord } from '../adr/ArchitectureDecisionRecord';
import type { GovernanceRule } from '../governance/GovernanceRule';
import type { Project } from '../project/project';
import type { Application } from '../repository/Application';
import type { BusinessProcess } from '../repository/BusinessProcess';
import type { Capability } from '../repository/Capability';
import type { Programme } from '../repository/Programme';
import type { Technology } from '../repository/Technology';
import type { BaseArchitectureElement } from '../repository/BaseArchitectureElement';
import type { BaseArchitectureRelationship } from '../repository/BaseArchitectureRelationship';
import type { ApplicationDependencyRelationship } from '../repository/ApplicationDependencyRelationship';
import type { ApplicationToTechnologyRelationship } from '../repository/ApplicationToTechnologyRelationship';
import type { CapabilityToProcessRelationship } from '../repository/CapabilityToProcessRelationship';
import type { ProcessToApplicationRelationship } from '../repository/ProcessToApplicationRelationship';
import type { ProgrammeImpactRelationship } from '../repository/ProgrammeImpactRelationship';
import type { ViewDefinition } from '../views/ViewDefinition';

/**
 * Canonical Exchange Model (CEM).
 *
 * Purpose:
 * - Neutral internal interchange contract used for ALL import/export.
 * - Lossless relative to the internal domain models.
 * - Supports loss-aware import via explicit unsupported-field capture.
 *
 * Non-goals (foundation):
 * - No binding to external standards.
 * - No serialization formats.
 */

export type CanonicalUnsupportedFieldReason =
  | 'UNMAPPED'
  | 'UNSUPPORTED'
  | 'INVALID'
  | 'AMBIGUOUS'
  | 'CONFLICT';

/**
 * Captures source fields that could not be represented in internal models.
 *
 * Notes:
 * - `path` SHOULD use a stable, JSONPath-like notation (e.g. "$.systems[0].owner").
 * - `value` preserves the original value (loss-aware; do not silently drop).
 */
export type CanonicalUnsupportedField = {
  path: string;
  value: unknown;
  reason: CanonicalUnsupportedFieldReason;
  message?: string;
};

export type CanonicalImportAnnotations = {
  /**
   * Unsupported/unmapped fields encountered during import.
   *
   * Determinism requirement:
   * - If populated, it SHOULD be sorted by `path` (then `reason`).
   */
  unsupportedFields?: CanonicalUnsupportedField[];

  /**
   * Extension slot for future, internal-only metadata.
   *
   * Interoperability rule:
   * - Do not store domain data here if a first-class field exists.
   */
  extensions?: Record<string, unknown>;
};

/**
 * Wraps any canonical payload with optional loss-aware import annotations.
 *
 * Why an envelope?
 * - Avoids mutating the core domain models.
 * - Allows deterministic capture of import loss without silently dropping.
 */
export type CanonicalEnvelope<T> = {
  value: T;
  annotations?: CanonicalImportAnnotations;
};

/** Canonical model version identifier (internal contract version, not a standard). */
export type CanonicalModelVersion = 'cem/1';

export type CanonicalProjectMetadata = Project & {
  /**
   * Canonical contract version.
   * Example: "cem/1".
   */
  canonicalModelVersion: CanonicalModelVersion;
};

export type CanonicalRepositoryElement =
  | Application
  | Capability
  | BusinessProcess
  | Technology
  | Programme
  // Fallback for future element types (must remain lossless)
  | BaseArchitectureElement;

export type CanonicalRelationship =
  | ApplicationDependencyRelationship
  | ApplicationToTechnologyRelationship
  | CapabilityToProcessRelationship
  | ProcessToApplicationRelationship
  | ProgrammeImpactRelationship
  // Fallback for future relationship types (must remain lossless)
  | BaseArchitectureRelationship;

export type CanonicalViewDefinition = ViewDefinition;

export type CanonicalGovernanceArtifacts = {
  rules: CanonicalEnvelope<GovernanceRule>[];
  adrs: CanonicalEnvelope<ArchitectureDecisionRecord>[];
};

/**
 * Root canonical exchange contract.
 *
 * Stability rules:
 * - Versioning is carried in `projectMetadata` (not via format-specific headers).
 * - All arrays are semantically unordered; deterministic import/export MUST sort externally.
 */
export type CanonicalExchangeModel = {
  projectMetadata: CanonicalEnvelope<CanonicalProjectMetadata>;

  repositoryElements: CanonicalEnvelope<CanonicalRepositoryElement>[];

  relationships: CanonicalEnvelope<CanonicalRelationship>[];

  /** View definitions only (no layout coordinates, no element payloads). */
  views: CanonicalEnvelope<CanonicalViewDefinition>[];

  governanceArtifacts: CanonicalGovernanceArtifacts;
};
