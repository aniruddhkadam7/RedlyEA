/**
 * Explorer module — enterprise-grade repository explorer tree.
 *
 * Public API:
 * - ExplorerTree: main React component (drop-in replacement)
 * - EXPLORER_KEYS: canonical tree key builder
 * - buildExplorerTree: pure function to build DataNode[] from repo state
 * - buildContextMenu: context menu factory
 * - explorerEventBus: typed event bus for cross-component communication
 * - explorerAuditLog: ring-buffer audit logger
 * - explorerPermissions: permission guard for explorer actions
 */

export { default as ExplorerTree } from './ExplorerTree';
export {
  type AuditActionType,
  type AuditEntry,
  auditObjectMutation,
  clearAuditLog,
  getObjectAuditTrail,
  queryAuditLog,
  writeAuditEntry,
} from './explorerAuditLog';
export {
  buildContextMenu,
  classifyNodeKey,
  type ExplorerMenuAction,
} from './explorerContextMenu';
export {
  bridgeLegacyEvents,
  type ExplorerEvent,
  emitExplorerEvent,
  onExplorerEvent,
} from './explorerEventBus';
export {
  EXPLORER_KEYS,
  getDefaultExpandedKeys,
  getObjectTypesByCategory,
  getObjectTypesByMetamodelLayer,
  getRelationshipTypesByCategory,
  resolveArchitectureName,
} from './explorerNodeRegistry';
export {
  assertCanPerform,
  canPerform,
  type ExplorerAction,
  filterMenuByPermission,
} from './explorerPermissions';
export {
  buildExplorerTree,
  type ExplorerTreeInput,
  type ExplorerTreeResult,
} from './explorerTreeBuilder';
