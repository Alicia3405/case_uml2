import { Injectable } from '@angular/core';
import {
  UmlAttribute,
  UmlClassNode,
  UmlConnection,
} from '../models/diagram.model';

export type AuditCategory = '1NF' | '2NF' | '3NF' | 'RELATION' | 'TYPE' | 'OPTIMIZATION';
export type AuditSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AuditAction =
  | 'ADD_PK'
  | 'SPLIT_MULTIVALUED'
  | 'CREATE_JUNCTION_TABLE'
  | 'SPLIT_TRANSITIVE'
  | 'FIX_TYPE'
  | 'CONNECT_ISOLATED'
  | 'ADD_ENUM_LITERAL';

export interface AuditRecommendation {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  description: string;
  targetNodeId?: string;
  targetNodeName?: string;
  suggestedAction: AuditAction;
  payload?: any;
}

export interface AuditReport {
  timestamp: string;
  score: number;
  recommendations: AuditRecommendation[];
  stats: {
    totalClasses: number;
    totalInterfaces: number;
    totalEnums: number;
    totalNotes: number;
    totalRelations: number;
    classesMissingPk: number;
    directManyToManys: number;
    multivaluedAttributes: number;
    transitiveDependencies: number;
    isolatedClasses: number;
  };
}

@Injectable({
  providedIn: 'root',
})
export class UmlAuditService {
  /**
   * Analiza el AST actual (nodos + conexiones Foblex Flow) evaluando 1FN, 2FN, 3FN e integridad CASE.
   */
  auditDiagram(nodes: UmlClassNode[], connections: UmlConnection[]): AuditReport {
    const recommendations: AuditRecommendation[] = [];
    const visibleNodes = (nodes || []).filter((n) => !n.isAnchor);
    const entityNodes = visibleNodes.filter((n) => {
      const et = (n.elementType || 'CLASS').toUpperCase();
      return et === 'CLASS' || et === 'ASSOCIATION_CLASS';
    });
    const interfaceNodes = visibleNodes.filter((n) => (n.elementType || '').toUpperCase() === 'INTERFACE');
    const enumNodes = visibleNodes.filter((n) => (n.elementType || '').toUpperCase() === 'ENUM');
    const noteNodes = visibleNodes.filter((n) => (n.elementType || '').toUpperCase() === 'NOTE');

    const validConnections = (connections || []).filter((c) => {
      const s = this.getBaseNodeId(c.sourceNodeId, c.sourceId);
      const t = this.getBaseNodeId(c.targetNodeId, c.targetId);
      return visibleNodes.some((n) => n.id === s) && visibleNodes.some((n) => n.id === t);
    });

    let classesMissingPk = 0;
    let directManyToManys = 0;
    let multivaluedAttributes = 0;
    let transitiveDependencies = 0;
    let isolatedClasses = 0;

    // 1. 1FN: Atributos multivaluados o compuestos en entidades
    for (const node of entityNodes) {
      for (const attr of node.attributes || []) {
        if (this.isMultivaluedAttribute(attr)) {
          multivaluedAttributes++;
          recommendations.push({
            id: `rec_1fn_split_${node.id}_${this.safeId(attr.name)}`,
            category: '1NF',
            severity: 'WARNING',
            title: `1FN: Atributo multivaluado '${node.name}.${attr.name}'`,
            description: `El atributo '${attr.name}: ${attr.type}' sugiere múltiples valores en una celda. Normalizar extrayendo entidad hija relacionada (1 a 1..*).`,
            targetNodeId: node.id,
            targetNodeName: node.name,
            suggestedAction: 'SPLIT_MULTIVALUED',
            payload: { nodeId: node.id, attrName: attr.name },
          });
        }

        if (!attr.type || ['object', 'any', 'var', 'unknown', ''].includes(attr.type.trim().toLowerCase())) {
          recommendations.push({
            id: `rec_type_${node.id}_${this.safeId(attr.name)}`,
            category: 'TYPE',
            severity: 'INFO',
            title: `Tipo genérico o vacío en '${node.name}.${attr.name}'`,
            description: `Se inferirá automáticamente un tipo concreto de dominio para '${attr.name}'.`,
            targetNodeId: node.id,
            targetNodeName: node.name,
            suggestedAction: 'FIX_TYPE',
            payload: { nodeId: node.id, attrName: attr.name },
          });
        }
      }
    }

    // 2. 2FN / Integridad de Entidad: Clave Primaria explícita [PK]
    for (const node of entityNodes) {
      const attrs = node.attributes || [];
      const hasExplicitPk = attrs.some((a) => Boolean(a.isPrimaryKey));
      if (!hasExplicitPk) {
        classesMissingPk++;
        const idCandidate = attrs.find((a) => this.isIdCandidate(a.name, node.name));
        recommendations.push({
          id: `rec_pk_${node.id}`,
          category: '2NF',
          severity: 'CRITICAL',
          title: idCandidate
            ? `2FN: Marcar '${idCandidate.name}' como [PK] en '${node.name}'`
            : `2FN: Falta Clave Primaria [PK] en '${node.name}'`,
          description: idCandidate
            ? `La entidad '${node.name}' tiene '${idCandidate.name}' pero no está marcado como Clave Primaria (isPrimaryKey) y NOT NULL.`
            : `La clase '${node.name}' carece de identificador único explícito. Se agregará '- id: UUID [PK]'.`,
          targetNodeId: node.id,
          targetNodeName: node.name,
          suggestedAction: 'ADD_PK',
          payload: { nodeId: node.id, existingAttrName: idCandidate?.name },
        });
      }
    }

    // 3. 2FN / Modelo Relacional: Relaciones N:M directas sin tabla intermedia
    for (const conn of validConnections) {
      if (conn.assocAnchorNodeId || conn.type === 'association_class' || conn.type === 'generalization' || conn.type === 'realization' || conn.type === 'dependency') {
        continue;
      }
      const sMult = (conn.sourceMultiplicity || '').trim().toLowerCase();
      const tMult = (conn.targetMultiplicity || '').trim().toLowerCase();
      const sourceIsMany = sMult.includes('*') || sMult.includes('n') || sMult.includes('m');
      const targetIsMany = tMult.includes('*') || tMult.includes('n') || tMult.includes('m');

      if (sourceIsMany && targetIsMany) {
        const sId = this.getBaseNodeId(conn.sourceNodeId, conn.sourceId);
        const tId = this.getBaseNodeId(conn.targetNodeId, conn.targetId);
        const src = entityNodes.find((n) => n.id === sId);
        const tgt = entityNodes.find((n) => n.id === tId);
        if (src && tgt && src.id !== tgt.id) {
          directManyToManys++;
          recommendations.push({
            id: `rec_nm_${conn.id}`,
            category: '2NF',
            severity: 'WARNING',
            title: `2FN: Relación N:M directa entre '${src.name}' y '${tgt.name}'`,
            description: `Descompone '${src.name} (${conn.sourceMultiplicity}) <-> (${conn.targetMultiplicity}) ${tgt.name}' en tabla intermedia '${src.name}_${tgt.name}' con dos relaciones 1 a 1..*.`,
            targetNodeId: src.id,
            targetNodeName: `${src.name} <-> ${tgt.name}`,
            suggestedAction: 'CREATE_JUNCTION_TABLE',
            payload: { connId: conn.id, sourceNodeId: src.id, targetNodeId: tgt.id },
          });
        }
      }
    }

    // 4. 3FN: Dependencias transitivas comunes (grupos repetidos / sub-entidades embebidas)
    for (const node of entityNodes) {
      const attrs = node.attributes || [];
      const cluster = this.detectTransitiveCluster(attrs, visibleNodes);
      if (cluster) {
        transitiveDependencies++;
        recommendations.push({
          id: `rec_3fn_${node.id}_${cluster.clusterKey}`,
          category: '3NF',
          severity: 'WARNING',
          title: `3FN: Posible dependencia transitiva (${cluster.label}) en '${node.name}'`,
          description: `Los campos [${cluster.matchedAttrs.join(', ')}] dependen entre sí más que de la PK de '${node.name}'. Se recomienda extraer tabla '${cluster.newEntityName}' (1 a 1..*).`,
          targetNodeId: node.id,
          targetNodeName: node.name,
          suggestedAction: 'SPLIT_TRANSITIVE',
          payload: {
            nodeId: node.id,
            newEntityName: cluster.newEntityName,
            attrNames: cluster.matchedAttrs,
          },
        });
      }
    }

    // 5. Enumeraciones vacías
    for (const en of enumNodes) {
      if (!en.attributes || en.attributes.length === 0) {
        recommendations.push({
          id: `rec_enum_empty_${en.id}`,
          category: 'OPTIMIZATION',
          severity: 'INFO',
          title: `Enum '${en.name}' sin literales definidos`,
          description: `Agrega literales base (ACTIVO, INACTIVO) para generar el tipo ENUM en PostgreSQL y Java.`,
          targetNodeId: en.id,
          targetNodeName: en.name,
          suggestedAction: 'ADD_ENUM_LITERAL',
          payload: { nodeId: en.id },
        });
      }
    }

    // 6. Entidades aisladas (excluye notas y enumeraciones)
    if (entityNodes.length > 1) {
      for (const node of entityNodes) {
        const hasConn = (connections || []).some((c) => {
          const s = this.getBaseNodeId(c.sourceNodeId, c.sourceId);
          const t = this.getBaseNodeId(c.targetNodeId, c.targetId);
          return s === node.id || t === node.id;
        });
        if (!hasConn) {
          isolatedClasses++;
          recommendations.push({
            id: `rec_iso_${node.id}`,
            category: 'RELATION',
            severity: 'INFO',
            title: `Entidad '${node.name}' sin relaciones`,
            description: `La tabla '${node.name}' está aislada en el modelo. Vincular mediante relación 1 a 1..* con la entidad principal.`,
            targetNodeId: node.id,
            targetNodeName: node.name,
            suggestedAction: 'CONNECT_ISOLATED',
            payload: { nodeId: node.id },
          });
        }
      }
    }

    // Puntaje de salud (0 - 100)
    let score = 100;
    score -= classesMissingPk * 18;
    score -= directManyToManys * 14;
    score -= multivaluedAttributes * 10;
    score -= transitiveDependencies * 10;
    score -= isolatedClasses * 6;
    score -= enumNodes.filter((e) => !e.attributes?.length).length * 4;
    score = Math.max(0, Math.min(100, score));

    return {
      timestamp: new Date().toISOString(),
      score,
      recommendations,
      stats: {
        totalClasses: entityNodes.length,
        totalInterfaces: interfaceNodes.length,
        totalEnums: enumNodes.length,
        totalNotes: noteNodes.length,
        totalRelations: validConnections.length,
        classesMissingPk,
        directManyToManys,
        multivaluedAttributes,
        transitiveDependencies,
        isolatedClasses,
      },
    };
  }

  /**
   * Aplica las recomendaciones seleccionadas retornando nuevas copias inmutables de nodos y conexiones.
   */
  applyFixes(
    nodes: UmlClassNode[],
    connections: UmlConnection[],
    selectedRecIds: Set<string>,
  ): { nodes: UmlClassNode[]; connections: UmlConnection[]; appliedCount: number } {
    const report = this.auditDiagram(nodes, connections);
    let nextNodes: UmlClassNode[] = JSON.parse(JSON.stringify(nodes));
    let nextConns: UmlConnection[] = JSON.parse(JSON.stringify(connections));
    let appliedCount = 0;

    for (const rec of report.recommendations) {
      if (!selectedRecIds.has(rec.id)) continue;
      const res = this.applySingleFix(nextNodes, nextConns, rec);
      nextNodes = res.nodes;
      nextConns = res.connections;
      appliedCount++;
    }

    return { nodes: nextNodes, connections: nextConns, appliedCount };
  }

  private applySingleFix(
    nodes: UmlClassNode[],
    connections: UmlConnection[],
    rec: AuditRecommendation,
  ): { nodes: UmlClassNode[]; connections: UmlConnection[] } {
    if (rec.suggestedAction === 'ADD_PK' && rec.payload?.nodeId) {
      const target = nodes.find((n) => n.id === rec.payload.nodeId);
      if (target) {
        target.attributes = target.attributes || [];
        const existingName = rec.payload.existingAttrName;
        const existing = existingName
          ? target.attributes.find((a) => a.name === existingName)
          : target.attributes.find((a) => this.isIdCandidate(a.name, target.name));
        if (existing) {
          existing.isPrimaryKey = true;
          existing.isNullable = false;
          existing.visibility = existing.visibility || '-';
        } else {
          target.attributes.unshift({
            name: 'id',
            type: 'UUID',
            visibility: '-',
            isPrimaryKey: true,
            isNullable: false,
          });
        }
      }
    }

    if (rec.suggestedAction === 'FIX_TYPE' && rec.payload) {
      const target = nodes.find((n) => n.id === rec.payload.nodeId);
      const attr = target?.attributes?.find((a) => a.name === rec.payload.attrName);
      if (attr) {
        attr.type = this.inferTypeFromName(attr.name);
      }
    }

    if (rec.suggestedAction === 'ADD_ENUM_LITERAL' && rec.payload?.nodeId) {
      const target = nodes.find((n) => n.id === rec.payload.nodeId);
      if (target) {
        target.attributes = target.attributes || [];
        if (target.attributes.length === 0) {
          target.attributes.push(
            { name: 'ACTIVO', type: 'EnumLiteral', visibility: '+' },
            { name: 'INACTIVO', type: 'EnumLiteral', visibility: '+' },
          );
        }
      }
    }

    if (rec.suggestedAction === 'SPLIT_MULTIVALUED' && rec.payload) {
      const parent = nodes.find((n) => n.id === rec.payload.nodeId);
      const attrName: string = rec.payload.attrName;
      if (parent && parent.attributes) {
        const idx = parent.attributes.findIndex((a) => a.name === attrName);
        if (idx >= 0) {
          parent.attributes.splice(idx, 1);
          const singularAttr = this.singularizeCapitalized(attrName);
          const childName = this.uniqueNodeName(`${parent.name}${singularAttr}`, nodes);
          const childId = `node_1fn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const childNode: UmlClassNode = {
            id: childId,
            name: childName,
            elementType: 'CLASS',
            position: { x: parent.position.x + 280, y: parent.position.y + 40 },
            width: 220,
            attributes: [
              { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false },
              { name: 'valor', type: 'String', visibility: '-', isPrimaryKey: false, isNullable: false },
            ],
            methods: [],
          };
          nodes.push(childNode);
          connections.push({
            id: `conn_1fn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            sourceNodeId: parent.id,
            targetNodeId: childId,
            sourceId: `${parent.id}_right`,
            targetId: `${childId}_left`,
            type: 'composition',
            lineStyle: 'segment',
            name: `tiene_${this.toSnake(singularAttr)}`,
            sourceMultiplicity: '1',
            targetMultiplicity: '1..*',
          });
        }
      }
    }

    if (rec.suggestedAction === 'SPLIT_TRANSITIVE' && rec.payload) {
      const parent = nodes.find((n) => n.id === rec.payload.nodeId);
      const attrNames: string[] = rec.payload.attrNames || [];
      if (parent && parent.attributes && attrNames.length > 0) {
        const extractedAttrs: UmlAttribute[] = [];
        for (const aName of attrNames) {
          const idx = parent.attributes.findIndex((a) => a.name === aName);
          if (idx >= 0) {
            const [removed] = parent.attributes.splice(idx, 1);
            extractedAttrs.push({
              ...removed,
              isPrimaryKey: false,
              visibility: removed.visibility || '-',
            });
          }
        }
        if (extractedAttrs.length > 0) {
          const entityName = this.uniqueNodeName(rec.payload.newEntityName || 'DetalleRelacionado', nodes);
          const newId = `node_3fn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const newNode: UmlClassNode = {
            id: newId,
            name: entityName,
            elementType: 'CLASS',
            position: { x: parent.position.x + 290, y: parent.position.y + 80 },
            width: 220,
            attributes: [
              { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false },
              ...extractedAttrs,
            ],
            methods: [],
          };
          nodes.push(newNode);
          connections.push({
            id: `conn_3fn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            sourceNodeId: newId,
            targetNodeId: parent.id,
            sourceId: `${newId}_left`,
            targetId: `${parent.id}_right`,
            type: 'association',
            lineStyle: 'segment',
            name: 'asociado_a',
            sourceMultiplicity: '1',
            targetMultiplicity: '1..*',
          });
        }
      }
    }

    if (rec.suggestedAction === 'CREATE_JUNCTION_TABLE' && rec.payload) {
      const { connId, sourceNodeId, targetNodeId } = rec.payload;
      const src = nodes.find((n) => n.id === sourceNodeId);
      const tgt = nodes.find((n) => n.id === targetNodeId);
      if (src && tgt) {
        const juncName = this.uniqueNodeName(`${src.name}_${tgt.name}`, nodes);
        const juncId = `node_2fn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const juncNode: UmlClassNode = {
          id: juncId,
          name: juncName,
          elementType: 'CLASS',
          stereotype: 'junction',
          position: {
            x: Math.round((src.position.x + tgt.position.x) / 2),
            y: Math.round((src.position.y + tgt.position.y) / 2) + 130,
          },
          width: 220,
          attributes: [
            { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false },
            { name: `${this.toCamel(src.name)}Id`, type: 'UUID', visibility: '-', isPrimaryKey: false, isNullable: false },
            { name: `${this.toCamel(tgt.name)}Id`, type: 'UUID', visibility: '-', isPrimaryKey: false, isNullable: false },
          ],
          methods: [],
        };
        nodes.push(juncNode);
        connections = connections.filter((c) => c.id !== connId);
        connections.push(
          {
            id: `conn_j1_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
            sourceNodeId: src.id,
            targetNodeId: juncId,
            sourceId: `${src.id}_bottom`,
            targetId: `${juncId}_top`,
            type: 'association',
            lineStyle: 'segment',
            name: 'posee',
            sourceMultiplicity: '1',
            targetMultiplicity: '1..*',
          },
          {
            id: `conn_j2_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
            sourceNodeId: tgt.id,
            targetNodeId: juncId,
            sourceId: `${tgt.id}_bottom`,
            targetId: `${juncId}_top`,
            type: 'association',
            lineStyle: 'segment',
            name: 'participa',
            sourceMultiplicity: '1',
            targetMultiplicity: '1..*',
          },
        );
      }
    }

    if (rec.suggestedAction === 'CONNECT_ISOLATED' && rec.payload?.nodeId) {
      const iso = nodes.find((n) => n.id === rec.payload.nodeId);
      const other = nodes.find(
        (n) =>
          !n.isAnchor &&
          n.id !== iso?.id &&
          ['CLASS', 'ASSOCIATION_CLASS'].includes((n.elementType || 'CLASS').toUpperCase()),
      );
      if (iso && other) {
        connections.push({
          id: `conn_iso_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          sourceNodeId: other.id,
          targetNodeId: iso.id,
          sourceId: `${other.id}_right`,
          targetId: `${iso.id}_left`,
          type: 'association',
          lineStyle: 'segment',
          name: 'relaciona',
          sourceMultiplicity: '1',
          targetMultiplicity: '1..*',
        });
      }
    }

    return { nodes, connections };
  }

  private getBaseNodeId(nodeId: string | undefined, portId: string | undefined): string {
    if (nodeId) return nodeId;
    return (portId || '').replace(/_(top|bottom|left|right)$/, '');
  }

  private isIdCandidate(name: string, tableName: string): boolean {
    const clean = (name || '').trim().toLowerCase();
    const tClean = (tableName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return clean === 'id' || clean === `${tClean}id` || clean === `${tClean}_id` || clean === `id_${tClean}`;
  }

  private isMultivaluedAttribute(attr: UmlAttribute): boolean {
    const name = (attr.name || '').trim().toLowerCase();
    const type = (attr.type || '').trim().toLowerCase();
    if (type !== 'byte[]' && (type.includes('list') || type.includes('set') || type.includes('[]'))) {
      return true;
    }
    if (name.includes(',') || name.includes(';')) return true;
    return /^(telefonos|correos|emails|direcciones|etiquetas|tags|imagenes|fotos|numeros|items|productos)$/.test(name);
  }

  private detectTransitiveCluster(
    attrs: UmlAttribute[],
    existingNodes: UmlClassNode[],
  ): { clusterKey: string; label: string; newEntityName: string; matchedAttrs: string[] } | null {
    const names = attrs.map((a) => a.name.toLowerCase());
    const existLower = new Set(existingNodes.map((n) => n.name.toLowerCase()));

    const clusters = [
      {
        clusterKey: 'ubicacion',
        label: 'Dirección / Ciudad / País',
        newEntityName: 'Ubicacion',
        keys: ['pais', 'ciudad', 'provincia', 'estado', 'codigo_postal', 'codigopostal', 'departamento', 'zona'],
      },
      {
        clusterKey: 'categoria',
        label: 'Categoría embebida',
        newEntityName: 'Categoria',
        keys: ['categorianombre', 'categoria_nombre', 'categoriadescripcion', 'categoria_descripcion', 'nombrecategoria'],
      },
    ];

    for (const c of clusters) {
      if (existLower.has(c.newEntityName.toLowerCase())) continue;
      const matched = attrs
        .filter((a) => c.keys.includes(a.name.toLowerCase()))
        .map((a) => a.name);
      if (matched.length >= 2 || (c.clusterKey === 'categoria' && names.filter((n) => n.startsWith('categoria')).length >= 2)) {
        const finalMatched =
          matched.length >= 2
            ? matched
            : attrs.filter((a) => a.name.toLowerCase().startsWith('categoria')).map((a) => a.name);
        return {
          clusterKey: c.clusterKey,
          label: c.label,
          newEntityName: c.newEntityName,
          matchedAttrs: finalMatched,
        };
      }
    }

    return null;
  }

  private inferTypeFromName(name: string): string {
    const l = (name || '').toLowerCase();
    if (l === 'id' || l.endsWith('id')) return 'UUID';
    if (l.includes('fecha') || l.includes('created') || l.includes('updated')) return 'LocalDateTime';
    if (l.includes('activo') || l.startsWith('es') || l.startsWith('is') || l.includes('habilitado')) return 'Boolean';
    if (l.includes('precio') || l.includes('total') || l.includes('monto') || l.includes('salario')) return 'BigDecimal';
    if (l.includes('cantidad') || l.includes('stock') || l.includes('edad') || l.includes('anio')) return 'Integer';
    return 'String';
  }

  private singularizeCapitalized(raw: string): string {
    const clean = (raw || 'Detalle').trim().replace(/[^a-zA-Z0-9]/g, '');
    let base = clean;
    if (base.toLowerCase().endsWith('es') && base.length > 4) base = base.slice(0, -2);
    else if (base.toLowerCase().endsWith('s') && base.length > 3) base = base.slice(0, -1);
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  private uniqueNodeName(desired: string, nodes: UmlClassNode[]): string {
    const existing = new Set(nodes.map((n) => n.name.toLowerCase()));
    if (!existing.has(desired.toLowerCase())) return desired;
    let i = 2;
    while (existing.has(`${desired}_${i}`.toLowerCase())) i++;
    return `${desired}_${i}`;
  }

  private safeId(raw: string): string {
    return (raw || 'attr').replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private toCamel(raw: string): string {
    const cleaned = (raw || 'entity').replace(/[^a-zA-Z0-9_]/g, '_');
    const pascal = cleaned
      .split('_')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  private toSnake(raw: string): string {
    return (raw || 'rel')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .toLowerCase();
  }
}

