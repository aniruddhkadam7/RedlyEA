// Neo4j schema for EA graph (read model)
//
// Labels / relationship types assumed by Neo4jGraphAdapter defaults:
// - Nodes: :EAElement
// - Relationships: :EA_REL (with relationshipType property for classification)
//
// Index/constraint goals:
// - node id (lookup)
// - node type (lookup)
// - relationship type (filter)

// Node identity (fast lookup + integrity)
CREATE CONSTRAINT ea_element_id_unique IF NOT EXISTS
FOR (n:EAElement)
REQUIRE n.id IS UNIQUE;

// Node type lookup
CREATE INDEX ea_element_type_idx IF NOT EXISTS
FOR (n:EAElement)
ON (n.elementType);

// Relationship classification (supports filtering when relationships share a single Neo4j rel-type)
CREATE INDEX ea_rel_relationshipType_idx IF NOT EXISTS
FOR ()-[r:EA_REL]-()
ON (r.relationshipType);

// Optional: relationship id lookup (useful for audits/debugging)
CREATE INDEX ea_rel_id_idx IF NOT EXISTS
FOR ()-[r:EA_REL]-()
ON (r.id);
