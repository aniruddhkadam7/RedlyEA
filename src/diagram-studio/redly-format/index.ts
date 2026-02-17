/**
 * Barrel export for the .Redly file format module.
 */

// Format types and validation
export type {
  RedlyAnnotation,
  RedlyEdge,
  RedlyFile,
  RedlyLayout,
  RedlyMetadata,
  RedlyNode,
  RedlyScope,
  RedlyValidationResult,
  RedlyViewport,
} from './RedlyFileFormat';
export {
  REDLY_FILE_EXTENSION,
  REDLY_FORMAT_VERSION,
  REDLY_MAGIC,
  REDLY_MIME_TYPE,
  validateRedlyFile,
} from './RedlyFileFormat';

// Service: serialize, deserialize, export, import
export type {
  CanvasEdgeData,
  CanvasNodeData,
  CanvasState,
  DeserializedView,
  ImportResult,
  SerializeViewInput,
} from './RedlyFileService';
export {
  deserializeView,
  exportRedlyFile,
  exportViewAsRedly,
  generateImportViewId,
  importRedlyFile,
  importRedlyFromJson,
  isRedlyFile,
  serializeView,
} from './RedlyFileService';

// Persistent store for .Redly files
export { RedlyViewStore } from './RedlyViewStore';
