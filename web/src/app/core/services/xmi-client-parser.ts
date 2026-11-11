import { XMLParser } from 'fast-xml-parser';
import {
  UmlAttribute,
  UmlClassNode,
  UmlConnection,
  UmlElementType,
  UmlLineStyle,
  UmlMethod,
  UmlVisibility,
} from '../models/diagram.model';

export interface ParsedDiagramResult {
  name: string;
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  defaultLineStyle: string;
}

interface EaElementMeta {
  sType?: string;
  xmiType?: string;
  name?: string;
  stereotype?: string;
  documentation?: string;
  pkAttributes: Set<string>;
  attrBoundsNullMap: Map<string, boolean>;
  attrTypeMap: Map<string, string>;
}

export class XmiClientParser {
  private static parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    trimValues: true,
  });

  public static parse(xmlContent: string): ParsedDiagramResult {
    if (!xmlContent || xmlContent.trim().length === 0) {
      throw new Error('El archivo XML/XMI está vacío.');
    }

    const parsed = this.parser.parse(xmlContent);
    const xmiRoot = parsed['xmi:XMI'] || parsed['XMI'] || parsed;
    if (!xmiRoot || (!xmiRoot['uml:Model'] && !xmiRoot['Model'] && !xmiRoot['xmi:Extension'])) {
      throw new Error('El archivo no contiene un nodo raíz XMI válido.');
    }

    let diagramName = 'Diagrama Importado';
    const umlModel = xmiRoot['uml:Model'] || xmiRoot['Model'];
    if (umlModel && umlModel['@_name']) {
      diagramName = umlModel['@_name'];
    }
    const pkgNode = umlModel?.['packagedElement'];
    if (
      pkgNode &&
      !Array.isArray(pkgNode) &&
      (pkgNode['@_xmi:type'] === 'uml:Package' || pkgNode['@_type'] === 'uml:Package') &&
      pkgNode['@_name'] &&
      diagramName === 'EA_Model'
    ) {
      diagramName = pkgNode['@_name'];
    }

    // 1. Extraer geometrías, estilos de línea y metadatos EA (<xmi:Extension>)
    const geometryMap = new Map<string, { left: number; top: number; width: number; height: number }>();
    const connectorLabelsMap = new Map<string, { name?: string; sMult?: string; tMult?: string }>();
    const connLineStyleMap = new Map<string, UmlLineStyle>();
    const eaMetaMap = new Map<string, EaElementMeta>();

    try {
      this.extractGeometry(xmiRoot, geometryMap, connectorLabelsMap, connLineStyleMap);
      this.extractEaElementMetadata(xmiRoot, eaMetaMap);
    } catch {
      // Continuar con grid por defecto si no hay bloque EA Extension
    }

    // 2. Extraer Clases, Interfaces, Enumeraciones y Notas
    const rawElements = this.collectPackagedElements(umlModel);
    const nodeMap = new Map<string, UmlClassNode>();
    const customTypeIdToName = new Map<string, string>();
    let gridIdx = 0;

    // Primera pasada rápida para resolver referencias entre clases/enums como tipos
    for (const elem of rawElements) {
      const id = elem?.['@_xmi:id'] || elem?.['@_id'];
      const name = elem?.['@_name'];
      if (id && name) {
        customTypeIdToName.set(id, name);
      }
    }

    for (const elem of rawElements) {
      const type = elem['@_xmi:type'] || elem['@_type'];
      const id = elem['@_xmi:id'] || elem['@_id'];
      const name = elem['@_name'];

      if (!id) continue;

      const eaMeta = eaMetaMap.get(id);
      const isClass = type === 'uml:Class' || type === 'uml:AssociationClass' || type === 'Class';
      const isInterface = type === 'uml:Interface' || type === 'Interface';
      const isEnum = type === 'uml:Enumeration' || type === 'Enumeration';
      const isNote = type === 'uml:Comment' || type === 'uml:Note' || type === 'Note';

      if (isClass || isInterface || isEnum || isNote) {
        const elementType: UmlElementType = isInterface
          ? 'INTERFACE'
          : isEnum
            ? 'ENUM'
            : isNote
              ? 'NOTE'
              : type === 'uml:AssociationClass'
                ? 'ASSOCIATION_CLASS'
                : 'CLASS';

        let attributes: UmlAttribute[] = [];
        let methods: UmlMethod[] = [];

        if (isEnum) {
          attributes = this.extractEnumLiterals(elem);
          methods = this.extractMethods(elem, customTypeIdToName);
        } else if (!isNote) {
          attributes = this.extractAttributes(elem, eaMeta, customTypeIdToName);
          methods = this.extractMethods(elem, customTypeIdToName);
        }

        let pos = { x: 80 + (gridIdx % 3) * 280, y: 80 + Math.floor(gridIdx / 3) * 220 };
        let width = 220;
        let height: number | undefined = undefined;

        if (geometryMap.has(id)) {
          const g = geometryMap.get(id)!;
          pos = { x: g.left, y: g.top };
          if (g.width > 50) width = g.width;
          if (g.height > 40) height = g.height;
        }

        const rawBody =
          typeof elem['@_body'] === 'string'
            ? elem['@_body']
            : typeof elem['body'] === 'string'
              ? elem['body']
              : '';

        const node: UmlClassNode = {
          id,
          name: isNote ? (eaMeta?.name || name || 'Nota') : (name || `Clase_${gridIdx + 1}`),
          elementType,
          stereotype: eaMeta?.stereotype || (isInterface ? 'interface' : isEnum ? 'enumeration' : undefined),
          noteContent: isNote ? (rawBody || eaMeta?.documentation || name || '') : undefined,
          position: pos,
          width,
          height,
          attributes,
          methods,
          isAnchor: false,
        };

        nodeMap.set(id, node);
        gridIdx++;
      }
    }

    // 2.1 Incorporar Notas EA declaradas solo en <xmi:Extension><elements>
    for (const [elId, meta] of eaMetaMap.entries()) {
      if (nodeMap.has(elId)) continue;
      if (meta.xmiType === 'uml:Note' || meta.sType === 'Note') {
        let pos = { x: 80 + (gridIdx % 3) * 280, y: 80 + Math.floor(gridIdx / 3) * 220 };
        let width = 220;
        let height: number | undefined = undefined;
        if (geometryMap.has(elId)) {
          const g = geometryMap.get(elId)!;
          pos = { x: g.left, y: g.top };
          if (g.width > 50) width = g.width;
          if (g.height > 40) height = g.height;
        }
        nodeMap.set(elId, {
          id: elId,
          name: meta.name || 'Nota',
          elementType: 'NOTE',
          noteContent: meta.documentation || meta.name || '',
          position: pos,
          width,
          height,
          attributes: [],
          methods: [],
          isAnchor: false,
        });
        gridIdx++;
      }
    }

    // 3. Extraer relaciones
    const connections: UmlConnection[] = [];
    const connSet = new Set<string>();

    for (const elem of rawElements) {
      const type = elem['@_xmi:type'] || elem['@_type'];

      if (type === 'uml:Association' || type === 'Association' || type === 'uml:AssociationClass') {
        const conn = this.parseAssociation(elem, nodeMap, connectorLabelsMap, connLineStyleMap);
        if (conn && !connSet.has(conn.id)) {
          connSet.add(conn.id);
          connections.push(conn);
        }
      }

      if (type === 'uml:Class' || type === 'Class' || type === 'uml:Interface' || type === 'Interface') {
        const genConns = this.parseGeneralizations(elem, nodeMap, connLineStyleMap);
        for (const gc of genConns) {
          if (!connSet.has(gc.id)) {
            connSet.add(gc.id);
            connections.push(gc);
          }
        }
      }
    }

    // 4. Conectores de extensión EA (incluye Realisation, Dependency, NoteLink)
    const eaConns = this.extractEaConnectors(xmiRoot, nodeMap, connLineStyleMap);
    for (const ec of eaConns) {
      if (!connSet.has(ec.id)) {
        connSet.add(ec.id);
        connections.push(ec);
      }
    }

    return {
      name: diagramName,
      nodes: Array.from(nodeMap.values()),
      connections,
      defaultLineStyle: 'segment',
    };
  }

  private static collectPackagedElements(modelRoot: any): any[] {
    const list: any[] = [];
    if (!modelRoot) return list;

    const traverse = (node: any) => {
      if (!node) return;

      const comments = node['ownedComment'];
      if (comments) {
        const commentList = Array.isArray(comments) ? comments : [comments];
        for (const c of commentList) {
          if (c && typeof c === 'object') {
            list.push({ '@_xmi:type': c['@_xmi:type'] || 'uml:Comment', ...c });
          }
        }
      }

      const pkged = node['packagedElement'] || node['ownedMember'];
      if (pkged) {
        if (Array.isArray(pkged)) {
          for (const item of pkged) {
            list.push(item);
            traverse(item);
          }
        } else if (typeof pkged === 'object') {
          list.push(pkged);
          traverse(pkged);
        }
      }
    };

    traverse(modelRoot);
    return list;
  }

  private static extractEnumLiterals(enumElem: any): UmlAttribute[] {
    const attrs: UmlAttribute[] = [];
    const literals = enumElem['ownedLiteral'];
    if (literals) {
      const list = Array.isArray(literals) ? literals : [literals];
      for (const lit of list) {
        const name = lit?.['@_name'];
        if (!name) continue;
        attrs.push({
          name,
          type: 'EnumLiteral',
          visibility: '+',
          isPrimaryKey: false,
          isNullable: false,
        });
      }
    }
    if (attrs.length === 0) {
      return this.extractAttributes(enumElem);
    }
    return attrs;
  }

  private static extractAttributes(
    classElem: any,
    eaMeta?: EaElementMeta,
    customTypeIdToName?: Map<string, string>,
  ): UmlAttribute[] {
    const attrs: UmlAttribute[] = [];
    const owned = classElem['ownedAttribute'] || classElem['attribute'];
    if (!owned) return attrs;

    const rawList = Array.isArray(owned) ? owned : [owned];
    for (const raw of rawList) {
      const name = raw['@_name'];
      if (!name) continue;

      let type = '';
      const typeElem = raw['type'];
      if (typeElem) {
        if (typeElem['@_xmi:idref']) {
          const ref = typeElem['@_xmi:idref'];
          type = customTypeIdToName?.get(ref) || eaMeta?.attrTypeMap?.get(name) || this.cleanTypeName(ref);
        } else if (typeElem['@_name']) {
          type = typeElem['@_name'];
        } else if (typeof typeElem === 'string') {
          type = this.cleanTypeName(typeElem);
        }
      } else if (raw['@_type']) {
        type = this.cleanTypeName(raw['@_type']);
      } else if (eaMeta?.attrTypeMap?.get(name)) {
        type = eaMeta.attrTypeMap.get(name)!;
      }

      const eaDeclaredType = eaMeta?.attrTypeMap?.get(name);
      if (eaDeclaredType && (!type || type.toLowerCase() === 'string')) {
        type = eaDeclaredType;
      }

      const isUnique = raw['@_isUnique'] === 'true' || raw['@_isUnique'] === true;
      const lowerVal = raw['lowerValue']?.['@_value'];
      const hasEaPk = eaMeta?.pkAttributes?.has(name) ?? false;
      const isPrimaryKey =
        hasEaPk || (isUnique && (name.toLowerCase().endsWith('id') || name.toLowerCase() === 'id'));
      const isNullable = isPrimaryKey
        ? false
        : lowerVal !== undefined
          ? String(lowerVal) === '0'
          : (eaMeta?.attrBoundsNullMap?.get(name) ?? true);

      attrs.push({
        name,
        type: this.mapType(type || 'String'),
        visibility: this.toVisibilitySymbol(raw['@_visibility'], '-'),
        isPrimaryKey,
        isNullable,
      });
    }

    return attrs;
  }

  private static extractMethods(
    classElem: any,
    customTypeIdToName?: Map<string, string>,
  ): UmlMethod[] {
    const methods: UmlMethod[] = [];
    const owned = classElem['ownedOperation'] || classElem['operation'];
    if (!owned) return methods;

    const rawList = Array.isArray(owned) ? owned : [owned];
    for (const raw of rawList) {
      const name = raw['@_name'];
      if (!name) continue;

      let returnType = 'void';
      const params: string[] = [];

      const rawParams = raw['ownedParameter'] || raw['parameter'];
      if (rawParams) {
        const pList = Array.isArray(rawParams) ? rawParams : [rawParams];
        for (const p of pList) {
          const pName = p['@_name'] || 'param';
          const pDirection = p['@_direction'];
          let pType = 'String';

          if (p['type'] && p['type']['@_xmi:idref']) {
            pType = customTypeIdToName?.get(p['type']['@_xmi:idref']) || this.cleanTypeName(p['type']['@_xmi:idref']);
          } else if (p['@_type']) {
            pType = customTypeIdToName?.get(p['@_type']) || this.cleanTypeName(p['@_type']);
          }

          pType = this.mapType(pType);

          if (pDirection === 'return' || pName === 'return') {
            returnType = pType;
          } else {
            params.push(`${pName}: ${pType}`);
          }
        }
      }

      methods.push({
        name,
        returnType,
        parameters: params.join(', '),
        visibility: this.toVisibilitySymbol(raw['@_visibility'], '+'),
      });
    }

    return methods;
  }

  private static parseAssociation(
    assocElem: any,
    nodeMap: Map<string, UmlClassNode>,
    labelsMap: Map<string, any>,
    connLineStyleMap?: Map<string, UmlLineStyle>,
  ): UmlConnection | null {
    const id = assocElem['@_xmi:id'] || assocElem['@_id'] || `conn_${Date.now()}`;
    const name = assocElem['@_name'] || '';

    let ends = assocElem['ownedEnd'];
    if (!ends || (Array.isArray(ends) && ends.length < 2)) {
      ends = assocElem['memberEnd'] || ends;
    }
    if (!ends) return null;

    const rawEnds = (Array.isArray(ends) ? ends : [ends]).filter((e: any) => !!e);
    const endsWithTypes = rawEnds.filter((e: any) => !!e.type || !!e['@_type']);
    const listToUse = endsWithTypes.length >= 2 ? endsWithTypes : rawEnds;

    if (listToUse.length < 2) return null;

    let sourceNodeId = '';
    let targetNodeId = '';
    let sMult = '';
    let tMult = '';
    let aggregation = 'none';

    const end0 = listToUse[0];
    const end1 = listToUse[1];

    const typeId0 = end0.type ? (end0.type['@_xmi:idref'] || end0.type['@_type'] || (typeof end0.type === 'string' ? end0.type : '')) : (end0['@_type'] || '');
    const typeId1 = end1.type ? (end1.type['@_xmi:idref'] || end1.type['@_type'] || (typeof end1.type === 'string' ? end1.type : '')) : (end1['@_type'] || '');

    const id0 = (end0['@_xmi:id'] || end0['@_id'] || '').toLowerCase();
    const id1 = (end1['@_xmi:id'] || end1['@_id'] || '').toLowerCase();

    if (id0.includes('src') || id1.includes('dst')) {
      sourceNodeId = typeId0;
      targetNodeId = typeId1;
      sMult = this.extractMult(end0);
      tMult = this.extractMult(end1);
      if (end0['@_aggregation'] && end0['@_aggregation'] !== 'none') aggregation = end0['@_aggregation'];
      if (end1['@_aggregation'] && end1['@_aggregation'] !== 'none') aggregation = end1['@_aggregation'];
    } else if (id1.includes('src') || id0.includes('dst')) {
      sourceNodeId = typeId1;
      targetNodeId = typeId0;
      sMult = this.extractMult(end1);
      tMult = this.extractMult(end0);
      if (end1['@_aggregation'] && end1['@_aggregation'] !== 'none') aggregation = end1['@_aggregation'];
      if (end0['@_aggregation'] && end0['@_aggregation'] !== 'none') aggregation = end0['@_aggregation'];
    } else {
      sourceNodeId = typeId0;
      targetNodeId = typeId1;
      sMult = this.extractMult(end0);
      tMult = this.extractMult(end1);
      if (end0['@_aggregation'] && end0['@_aggregation'] !== 'none') aggregation = end0['@_aggregation'];
      if (end1['@_aggregation'] && end1['@_aggregation'] !== 'none') aggregation = end1['@_aggregation'];
    }

    if (!sourceNodeId || !targetNodeId || !nodeMap.has(sourceNodeId) || !nodeMap.has(targetNodeId)) {
      return null;
    }

    let type: UmlConnection['type'] = 'association';
    if (aggregation === 'composite') type = 'composition';
    else if (aggregation === 'shared') type = 'aggregation';

    if (labelsMap.has(id)) {
      const lbl = labelsMap.get(id)!;
      if (!sMult && lbl.sMult) sMult = lbl.sMult;
      if (!tMult && lbl.tMult) tMult = lbl.tMult;
    }

    const lineStyle = connLineStyleMap?.get(id) || 'segment';

    return {
      id,
      sourceNodeId,
      targetNodeId,
      sourceId: `${sourceNodeId}_right`,
      targetId: `${targetNodeId}_left`,
      type,
      name: name || undefined,
      sourceMultiplicity: sMult || '1',
      targetMultiplicity: tMult || '0..*',
      lineStyle,
    };
  }

  private static parseGeneralizations(
    classElem: any,
    nodeMap: Map<string, UmlClassNode>,
    connLineStyleMap?: Map<string, UmlLineStyle>,
  ): UmlConnection[] {
    const conns: UmlConnection[] = [];
    const sourceId = classElem['@_xmi:id'] || classElem['@_id'];
    if (!sourceId || !nodeMap.has(sourceId)) return conns;

    const generalizations = classElem['generalization'];
    if (!generalizations) return conns;

    const rawList = Array.isArray(generalizations) ? generalizations : [generalizations];
    for (const g of rawList) {
      const targetId = g['@_general'] || (g['general'] && g['general']['@_xmi:idref']);
      if (targetId && nodeMap.has(targetId)) {
        const id = g['@_xmi:id'] || `gen_${sourceId}_${targetId}`;
        const lineStyle = connLineStyleMap?.get(id) || 'segment';
        conns.push({
          id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          sourceId: `${sourceId}_top`,
          targetId: `${targetId}_bottom`,
          type: 'generalization',
          lineStyle,
          sourceMultiplicity: '',
          targetMultiplicity: '',
        });
      }
    }

    return conns;
  }

  private static extractEaConnectors(
    xmiRoot: any,
    nodeMap: Map<string, UmlClassNode>,
    connLineStyleMap?: Map<string, UmlLineStyle>,
  ): UmlConnection[] {
    const conns: UmlConnection[] = [];
    const ext = xmiRoot['xmi:Extension'] || xmiRoot['Extension'];
    if (!ext) return conns;

    const connectors = ext['connectors'];
    if (!connectors) return conns;

    const list = connectors['connector'];
    if (!list) return conns;

    const rawList = Array.isArray(list) ? list : [list];
    for (const c of rawList) {
      const id = c['@_xmi:idref'] || c['@_id'] || `conn_${Date.now()}`;
      const src = c['source'];
      const tgt = c['target'];
      if (!src || !tgt) continue;

      const sourceId = src['@_xmi:idref'] || (src['model'] && src['model']['@_ea_localid']);
      const targetId = tgt['@_xmi:idref'] || (tgt['model'] && tgt['model']['@_ea_localid']);

      if (!sourceId || !targetId || !nodeMap.has(sourceId) || !nodeMap.has(targetId)) continue;

      const eaProps = c['properties'] || {};
      const eaType = eaProps['@_ea_type'] || 'Association';

      let type: UmlConnection['type'] = 'association';
      if (eaType === 'Generalization') type = 'generalization';
      else if (eaType === 'Realisation' || eaType === 'Realization') type = 'realization';
      else if (eaType === 'Dependency' || eaType === 'NoteLink') type = 'dependency';

      const srcType = src['type'] || {};
      const tgtType = tgt['type'] || {};
      if (srcType['@_aggregation'] === 'composite' || tgtType['@_aggregation'] === 'composite') {
        type = 'composition';
      } else if (srcType['@_aggregation'] === 'shared' || tgtType['@_aggregation'] === 'shared') {
        type = 'aggregation';
      }

      const labels = c['labels'] || {};
      const sMult = labels['@_lb'] || srcType['@_multiplicity'] || '';
      const tMult = labels['@_rb'] || tgtType['@_multiplicity'] || '';
      const name = labels['@_mb'] || undefined;

      const appearance = c['appearance'] || {};
      const linemode = appearance['@_linemode'];
      const style = connLineStyleMap?.get(id) || this.mapEaModeToLineStyle(linemode);

      conns.push({
        id,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        sourceId: `${sourceId}_right`,
        targetId: `${targetId}_left`,
        type,
        name,
        sourceMultiplicity: sMult || (type === 'generalization' || type === 'dependency' || type === 'realization' ? '' : '1'),
        targetMultiplicity: tMult || (type === 'generalization' || type === 'dependency' || type === 'realization' ? '' : '0..*'),
        lineStyle: style,
      });
    }

    return conns;
  }

  private static extractGeometry(
    xmiRoot: any,
    geometryMap: Map<string, any>,
    labelsMap: Map<string, any>,
    connLineStyleMap?: Map<string, UmlLineStyle>,
  ): void {
    const ext = xmiRoot['xmi:Extension'] || xmiRoot['Extension'];
    if (!ext) return;

    const diagrams = ext['diagrams'];
    if (!diagrams) return;

    const list = diagrams['diagram'];
    if (!list) return;

    const primary = Array.isArray(list) ? list[0] : list;
    if (!primary || !primary['elements']) return;

    const elemList = primary['elements']['element'];
    if (!elemList) return;

    const rawList = Array.isArray(elemList) ? elemList : [elemList];
    for (const elem of rawList) {
      const subject = elem['@_subject'];
      const geometry = elem['@_geometry'];
      const style = elem['@_style'];

      if (subject && style && connLineStyleMap) {
        const modeMatch = style.match(/Mode=(\d+)/);
        if (modeMatch) {
          connLineStyleMap.set(subject, this.mapEaModeToLineStyle(modeMatch[1]));
        }
      }

      if (subject && geometry) {
        const leftMatch = geometry.match(/Left=(-?\d+)/);
        const topMatch = geometry.match(/Top=(-?\d+)/);
        const rightMatch = geometry.match(/Right=(-?\d+)/);
        const bottomMatch = geometry.match(/Bottom=(-?\d+)/);

        if (leftMatch && topMatch && rightMatch && bottomMatch) {
          const left = parseInt(leftMatch[1], 10);
          const top = parseInt(topMatch[1], 10);
          const right = parseInt(rightMatch[1], 10);
          const bottom = parseInt(bottomMatch[1], 10);

          geometryMap.set(subject, {
            left: Math.max(30, left),
            top: Math.max(30, top),
            width: Math.max(160, right - left),
            height: Math.max(60, bottom - top),
          });
        }
      }
    }
  }

  private static extractEaElementMetadata(
    xmiRoot: any,
    metaMap: Map<string, EaElementMeta>,
  ): void {
    const ext = xmiRoot['xmi:Extension'] || xmiRoot['Extension'];
    const elements = ext?.['elements']?.['element'];
    if (!elements) return;

    const list = Array.isArray(elements) ? elements : [elements];
    for (const el of list) {
      const idref = el?.['@_xmi:idref'] || el?.['@_xmi:id'] || el?.['@_id'];
      if (!idref) continue;
      const props = el?.['properties'] || {};
      const pkAttributes = new Set<string>();
      const attrBoundsNullMap = new Map<string, boolean>();
      const attrTypeMap = new Map<string, string>();

      const rawAttrs = el?.['attributes']?.['attribute'];
      if (rawAttrs) {
        const attrList = Array.isArray(rawAttrs) ? rawAttrs : [rawAttrs];
        for (const a of attrList) {
          const aName = a?.['@_name'];
          if (!aName) continue;
          const st = a?.['stereotype']?.['@_stereotype'];
          if (st && String(st).toUpperCase() === 'PK') {
            pkAttributes.add(aName);
          }
          const lower = a?.['bounds']?.['@_lower'];
          if (lower !== undefined) {
            attrBoundsNullMap.set(aName, String(lower) === '0');
          }
          const declType = a?.['properties']?.['@_type'];
          if (declType) {
            attrTypeMap.set(aName, declType);
          }
        }
      }

      metaMap.set(idref, {
        sType: props['@_sType'],
        xmiType: el?.['@_xmi:type'],
        name: el?.['@_name'],
        stereotype: props['@_stereotype'],
        documentation: props['@_documentation'],
        pkAttributes,
        attrBoundsNullMap,
        attrTypeMap,
      });
    }
  }

  public static mapEaModeToLineStyle(mode: string | number | undefined): UmlLineStyle {
    const m = String(mode || '3');
    switch (m) {
      case '1':
      case 'Direct':
        return 'straight';
      case '4':
      case 'Bezier':
        return 'bezier';
      case '10':
      case 'Orthogonal - Rounded':
      case 'Orthogonal Rounded':
        return 'adaptive-curve';
      case '3':
      case 'Custom Line':
      case 'Custom':
      case '2':
      case 'Auto Routing':
      default:
        return 'segment';
    }
  }

  private static extractMult(endElem: any): string {
    const lowerElem = endElem['lowerValue'];
    const upperElem = endElem['upperValue'];

    const lower = lowerElem ? (lowerElem['@_value'] !== undefined ? String(lowerElem['@_value']) : '1') : '';
    const upper = upperElem ? (upperElem['@_value'] !== undefined ? String(upperElem['@_value']) : '1') : '';

    if (lower === '0' && (upper === '-1' || upper === '*')) return '0..*';
    if (lower === '1' && (upper === '-1' || upper === '*')) return '1..*';
    if (lower === '0' && upper === '1') return '0..1';
    if (lower === '1' && upper === '1') return '1';
    if (upper === '-1') return '*';
    if (lower && upper && lower !== upper) return `${lower}..${upper}`;
    return upper || lower || '';
  }

  private static cleanTypeName(raw: string): string {
    if (!raw) return 'String';
    return raw.replace(/^EAJava_/, '').replace(/^uml:/, '');
  }

  private static toVisibilitySymbol(raw: string | undefined, fallback: UmlVisibility): UmlVisibility {
    const v = (raw || '').trim().toLowerCase();
    if (v === '+' || v === 'public') return '+';
    if (v === '-' || v === 'private') return '-';
    if (v === '#' || v === 'protected') return '#';
    if (v === '~' || v === 'package') return '~';
    return fallback;
  }

  private static mapType(type: string): string {
    const lower = (type || '').toLowerCase().trim();
    if (lower === 'uuid') return 'UUID';
    if (lower === 'string' || lower === 'varchar') return 'String';
    if (lower === 'text') return 'Text';
    if (lower === 'int' || lower === 'integer') return 'Integer';
    if (lower === 'long' || lower === 'bigint') return 'Long';
    if (lower === 'bool' || lower === 'boolean') return 'Boolean';
    if (lower === 'double') return 'Double';
    if (lower === 'float') return 'Float';
    if (lower === 'bigdecimal' || lower === 'decimal' || lower === 'numeric') return 'BigDecimal';
    if (lower === 'localdate' || lower === 'date') return 'LocalDate';
    if (lower === 'localdatetime' || lower === 'timestamp') return 'LocalDateTime';
    if (lower === 'enumliteral') return 'EnumLiteral';
    if (lower === 'void') return 'void';
    return type || 'String';
  }
}
