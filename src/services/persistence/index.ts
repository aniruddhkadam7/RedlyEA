/**
 * Redly Persistence — Public API
 *
 * This module provides the complete `.Redly` file format implementation:
 *
 * - **Export**: `buildRedlyFile()` — creates a `.Redly` ZIP from repository state
 * - **Import**: `parseRedlyFile()` — reads and validates a `.Redly` ZIP
 * - **Migration**: `checkAndMigrateVersion()` — handles format version upgrades
 * - **Validation**: `validateRepositoryData()` — integrity checks
 * - **Types**: All type definitions for the `.Redly` format
 */

export { buildRedlyFile, type RedlyExportSource } from './redlyExportService';
export { parseRedlyFile } from './redlyImportService';
export { checkAndMigrateVersion } from './redlyMigration';
export {
  validateRepositoryData,
  validateRedlyMetadataStructure,
  validateRedlyRepositoryStructure,
} from './redlyValidation';
export {
  REDLY_FORMAT_VERSION,
  type RedlyMetadata,
  type RedlyElement,
  type RedlyRelationship,
  type RedlyRepositoryData,
  type RedlyDiagramData,
  type RedlyLayoutData,
  type RedlyLayoutPosition,
  type RedlyPackage,
  type RedlyExportResult,
  type RedlyImportResult,
  type RedlyValidationResult,
} from './redlyTypes';
