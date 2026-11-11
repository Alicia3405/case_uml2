import { XMLParser } from 'fast-xml-parser';
import { UmlClassNode, UmlConnection, UmlLineStyle } from '../models/diagram.model';

export interface ParsedDiagramResult {
  name: string;
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  defaultLineStyle: string;
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
    if (!xmiRoot) {
      throw new Error('El archivo no contiene un nodo raíz XMI válido.');
    }

    let diagramName = 'Diagrama Importado';
    const umlModel = xmiRoot['uml:Model'] || xmiRoot['Model'];
    if (umlModel && umlModel['@_name']) {
      diagramName = umlModel['@_name'];
    }

    // 1. Extraer geometrías y estilos de línea desde <xmi:Extension><diagrams><diagram><elements>
    const geometryMap = new Map<string, { left: number; top: number; width: number; height: number }>();
    const connectorLabelsMap = new Map<string, { name?: string; sMult?: string; tMult?: string }>();
    const connLineStyleMap = new Map<string, UmlLineStyle>();

    try {
      this.extractGeometry(xmiRoot, geometryMap, connectorLabelsMap, connLineStyleMap);
    } catch (e) {
      // Ignorar errores de layout y continuar con grid
    }

    // 2. Extraer clases y elementos
    const rawElements = this.collectPackagedElements(umlModel);
    const nodeMap = new Map<string, UmlClassNode>();
    let gridIdx = 0;

    for (const elem of rawElements) {
      const type = elem['@_xmi:type'] || elem['@_type'];
      const id = elem['@_xmi:id'] || elem['@_id'];
      const name = elem['@_name'];

      if (!id) continue;

      if (type === 'uml:Class' || type === 'uml:AssociationClass' || type === 'Class') {
        const attributes = this.extractAttributes(elem);
        const methods = this.extractMethods(elem);

        let pos = { x: 80 + (gridIdx % 3) * 280, y: 80 + Math.floor(gridIdx / 3) * 220 };
        let width = 220;
        let height = 120;

        if (geometryMap.has(id)) {
          const g = geometryMap.get(id)!;
          pos = { x: g.left, y: g.top };
          if (g.width > 50) width = g.width;
          if (g.height > 40) height = g.height;
        }

        const node: UmlClassNode = {
          id,
          name: name || `Clase_${gridIdx + 1}`,
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

    // 3. Extraer relaciones
    const connections: UmlConnection[] = [];
    const connSet = new Set<string>();

    for (const elem of rawElements) {
      const type = elem['@_xmi:type'] || elem['@_type'];
      const id = elem['@_xmi:id'] || elem['@_id'];

      if (type === 'uml:Association' || type === 'Association' || type === 'uml:AssociationClass') {
        const conn = this.parseAssociation(elem, nodeMap, connectorLabelsMap, connLineStyleMap);
        if (conn && !connSet.has(conn.id)) {
          connSet.add(conn.id);
          connections.push(conn);
        }
      }

      if (type === 'uml:Class' || type === 'Class') {
        const genConns = this.parseGeneralizations(elem, nodeMap, connLineStyleMap);
        for (const gc of genConns) {
          if (!connSet.has(gc.id)) {
            connSet.add(gc.id);
            connections.push(gc);
          }
        }
      }
    }

    // 4. Conectores de extensión EA
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

  private static extractAttributes(classElem: any) {
    const attrs: any[] = [];
    const owned = classElem['ownedAttribute'] || classElem['attribute'];
    if (!owned) return attrs;

    const rawList = Array.isArray(owned) ? owned : [owned];
    for (const raw of rawList) {
      const name = raw['@_name'];
      if (!name) continue;

      let type = 'String';
      const typeElem = raw['type'];
      if (typeElem) {
        if (typeElem['@_xmi:idref']) type = this.cleanTypeName(typeElem['@_xmi:idref']);
        else if (typeElem['@_name']) type = typeElem['@_name'];
        else if (typeof typeElem === 'string') type = this.cleanTypeName(typeElem);
      } else if (raw['@_type']) {
        type = this.cleanTypeName(raw['@_type']);
      }

      attrs.push({
        name,
        type: this.mapType(type),
        visibility: raw['@_visibility'] || 'private',
        isPk: (name.toLowerCase().endsWith('id') || name.toLowerCase() === 'id'),
        isNullable: false,
      });
    }

    return attrs;
  }

  private static extractMethods(classElem: any) {
    const methods: any[] = [];
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

          if (p['type'] && p['type']['@_xmi:idref']) pType = this.cleanTypeName(p['type']['@_xmi:idref']);
          else if (p['@_type']) pType = this.cleanTypeName(p['@_type']);

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
        visibility: raw['@_visibility'] || 'public',
      });
    }

    return methods;
  }

  private static parseAssociation(assocElem: any, nodeMap: Map<string, any>, labelsMap: Map<string, any>, connLineStyleMap?: Map<string, UmlLineStyle>): UmlConnection | null {
    const id = assocElem['@_xmi:id'] || assocElem['@_id'] || `conn_${Date.now()}`;
    const name = assocElem['@_name'] || '';

    // Priorizar ownedEnd con definiciones de tipo
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

    // Determinar extremos src/dst
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

    let type: any = 'association';
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

  private static parseGeneralizations(classElem: any, nodeMap: Map<string, any>, connLineStyleMap?: Map<string, UmlLineStyle>): UmlConnection[] {
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

  private static extractEaConnectors(xmiRoot: any, nodeMap: Map<string, any>, connLineStyleMap?: Map<string, UmlLineStyle>): UmlConnection[] {
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

      let type: any = 'association';
      if (eaType === 'Generalization') type = 'generalization';
      else if (eaType === 'Realisation') type = 'realization';
      else if (eaType === 'Dependency') type = 'dependency';

      const labels = c['labels'] || {};
      const sMult = labels['@_lb'] || '';
      const tMult = labels['@_rb'] || '';
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
        sourceMultiplicity: sMult || '1',
        targetMultiplicity: tMult || '0..*',
        lineStyle: style,
      });
    }

    return conns;
  }

  private static extractGeometry(xmiRoot: any, geometryMap: Map<string, any>, labelsMap: Map<string, any>, connLineStyleMap?: Map<string, UmlLineStyle>): void {
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

  private static mapType(type: string): string {
    const lower = (type || '').toLowerCase().trim();
    if (lower === 'uuid') return 'UUID';
    if (lower === 'string' || lower === 'text' || lower === 'varchar') return 'String';
    if (lower === 'int' || lower === 'integer') return 'Integer';
    if (lower === 'long' || lower === 'bigint') return 'Long';
    if (lower === 'bool' || lower === 'boolean') return 'Boolean';
    if (lower === 'double') return 'Double';
    if (lower === 'float') return 'Float';
    if (lower === 'bigdecimal' || lower === 'decimal' || lower === 'numeric') return 'BigDecimal';
    if (lower === 'localdate' || lower === 'date') return 'LocalDate';
    if (lower === 'localdatetime' || lower === 'timestamp') return 'LocalDateTime';
    if (lower === 'void') return 'void';
    return type || 'String';
  }
}
