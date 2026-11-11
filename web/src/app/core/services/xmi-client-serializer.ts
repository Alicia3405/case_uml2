import { Injectable } from '@angular/core';
import { UmlClassNode, UmlConnection, UmlLineStyle } from '../models/diagram.model';
import { XmiClientParser } from './xmi-client-parser';

export interface XmiValidationCheck {
  title: string;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
}

export interface XmiValidationReport {
  isValid: boolean;
  totalElements: number;
  totalClasses: number;
  totalInterfaces: number;
  totalEnums: number;
  totalNotes: number;
  totalRelations: number;
  roundTripVerified: boolean;
  checks: XmiValidationCheck[];
}

@Injectable({
  providedIn: 'root',
})
export class XmiClientSerializer {
  /**
   * Serializa el diagrama actual (guardado o en borrador) a OMG XMI 2.1 compatible con Enterprise Architect.
   */
  serialize(
    nodes: UmlClassNode[],
    connections: UmlConnection[],
    diagramName = 'Diagrama_Principal',
    defaultLineStyle: UmlLineStyle = 'segment',
  ): string {
    const pkgGuid = this.makeId('PKG');
    const diagramGuid = this.makeId('DIAG');
    const packageName = diagramName || 'Diagrama_Principal';
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const visibleNodes = (nodes || []).filter((n) => !n.isAnchor);
    const nodeEaIdMap = new Map<string, string>();
    const nodeDuidMap = new Map<string, string>();
    const connEaIdMap = new Map<string, string>();

    for (const node of visibleNodes) {
      nodeEaIdMap.set(node.id, `EAID_${this.normalizeToken(node.id)}`);
      nodeDuidMap.set(node.id, this.shortHash(node.id));
    }

    const validConnections = (connections || []).filter((c) => {
      const s = c.sourceNodeId || c.sourceId?.replace(/_(top|bottom|left|right)$/, '');
      const t = c.targetNodeId || c.targetId?.replace(/_(top|bottom|left|right)$/, '');
      return nodeEaIdMap.has(s) && nodeEaIdMap.has(t);
    });

    for (const conn of validConnections) {
      connEaIdMap.set(conn.id, `EAID_${this.normalizeToken(conn.id)}`);
    }

    let umlPackagedElements = '';
    let eaElementsXml = '';
    let eaConnectorsXml = '';
    let eaDiagramElementsXml = '';

    eaElementsXml += `\t\t\t<element xmi:idref="EAPK_${pkgGuid}" xmi:type="uml:Package" name="${this.escapeXml(packageName)}" scope="public">\n`;
    eaElementsXml += `\t\t\t\t<model package2="EAID_${pkgGuid}" package="EAPK_${pkgGuid}" tpos="1" ea_localid="1" ea_eleType="package"/>\n`;
    eaElementsXml += `\t\t\t\t<properties isSpecification="false" sType="Package" nType="0" scope="public"/>\n`;
    eaElementsXml += `\t\t\t</element>\n`;

    let seqno = 1;
    for (const node of visibleNodes) {
      const eaId = nodeEaIdMap.get(node.id)!;
      const duid = nodeDuidMap.get(node.id)!;
      const elType = (node.elementType || 'CLASS').toUpperCase();
      const customStereo = (node.stereotype || '').trim();

      if (elType === 'NOTE') {
        const noteText = (node.noteContent || node.name || '').trim();
        umlPackagedElements += `\t\t\t<ownedComment xmi:type="uml:Comment" xmi:id="${eaId}" body="${this.escapeXml(noteText)}"/>\n`;
        eaElementsXml += `\t\t\t<element xmi:idref="${eaId}" xmi:type="uml:Note" name="${this.escapeXml(node.name || 'Nota')}" scope="public">\n`;
        eaElementsXml += `\t\t\t\t<model package="EAPK_${pkgGuid}" tpos="0" ea_eleType="element"/>\n`;
        eaElementsXml += `\t\t\t\t<properties documentation="${this.escapeXml(noteText)}" isSpecification="false" sType="Note" nType="0" scope="public"/>\n`;
        eaElementsXml += `\t\t\t</element>\n`;
      } else {
        const umlXmiType =
          elType === 'INTERFACE'
            ? 'uml:Interface'
            : elType === 'ENUM'
              ? 'uml:Enumeration'
              : elType === 'ASSOCIATION_CLASS'
                ? 'uml:AssociationClass'
                : 'uml:Class';
        const eaSType =
          elType === 'INTERFACE'
            ? 'Interface'
            : elType === 'ENUM'
              ? 'Enumeration'
              : 'Class';
        const effStereo =
          customStereo ||
          (elType === 'INTERFACE' ? 'interface' : elType === 'ENUM' ? 'enumeration' : '');

        umlPackagedElements += `\t\t\t<packagedElement xmi:type="${umlXmiType}" xmi:id="${eaId}" name="${this.escapeXml(node.name)}" visibility="public"${elType === 'INTERFACE' ? ' isAbstract="true"' : ''}>\n`;

        let eaAttributesXml = '';
        let eaOperationsXml = '';

        if (elType === 'ENUM' && node.attributes?.length) {
          node.attributes.forEach((attr, i) => {
            const litId = `EAID_LIT_${this.normalizeToken(`${node.id}_${i}`)}`;
            umlPackagedElements += `\t\t\t\t<ownedLiteral xmi:type="uml:EnumerationLiteral" xmi:id="${litId}" name="${this.escapeXml(attr.name)}"/>\n`;
            eaAttributesXml += `\t\t\t\t\t<attribute xmi:idref="${litId}" name="${this.escapeXml(attr.name)}" scope="Public">\n`;
            eaAttributesXml += `\t\t\t\t\t\t<properties type="EnumLiteral"/>\n`;
            eaAttributesXml += `\t\t\t\t\t\t<stereotype stereotype="enum"/>\n`;
            eaAttributesXml += `\t\t\t\t\t</attribute>\n`;
          });
        } else if (node.attributes?.length) {
          node.attributes.forEach((attr, i) => {
            const attrId = `EAID_AT_${this.normalizeToken(`${node.id}_${i}_${attr.name}`)}`;
            const visWord = this.visibilityWord(attr.visibility, 'private');
            const lowerVal = attr.isPrimaryKey || attr.isNullable === false ? '1' : '0';
            const attrType = attr.type || 'String';
            const ref = this.getEaTypeReference(attrType, visibleNodes, nodeEaIdMap);

            umlPackagedElements += `\t\t\t\t<ownedAttribute xmi:type="uml:Property" xmi:id="${attrId}" name="${this.escapeXml(attr.name)}" visibility="${visWord}" isUnique="${attr.isPrimaryKey ? 'true' : 'false'}">\n`;
            umlPackagedElements += `\t\t\t\t\t<lowerValue xmi:type="uml:LiteralInteger" xmi:id="${attrId}_L" value="${lowerVal}"/>\n`;
            umlPackagedElements += `\t\t\t\t\t<upperValue xmi:type="uml:LiteralInteger" xmi:id="${attrId}_U" value="1"/>\n`;
            umlPackagedElements += `\t\t\t\t\t<type xmi:idref="${ref}"/>\n`;
            umlPackagedElements += `\t\t\t\t</ownedAttribute>\n`;

            eaAttributesXml += `\t\t\t\t\t<attribute xmi:idref="${attrId}" name="${this.escapeXml(attr.name)}" scope="${this.capitalize(visWord)}">\n`;
            eaAttributesXml += `\t\t\t\t\t\t<properties type="${this.escapeXml(attrType)}"/>\n`;
            if (attr.isPrimaryKey) {
              eaAttributesXml += `\t\t\t\t\t\t<stereotype stereotype="PK"/>\n`;
            }
            eaAttributesXml += `\t\t\t\t\t\t<bounds lower="${lowerVal}" upper="1"/>\n`;
            eaAttributesXml += `\t\t\t\t\t</attribute>\n`;
          });
        }

        if (node.methods?.length) {
          node.methods.forEach((method, i) => {
            const opId = `EAID_OP_${this.normalizeToken(`${node.id}_${i}_${method.name}`)}`;
            const visWord = this.visibilityWord(method.visibility, 'public');
            const retType = method.returnType || 'void';

            umlPackagedElements += `\t\t\t\t<ownedOperation xmi:id="${opId}" name="${this.escapeXml(method.name)}" visibility="${visWord}" concurrency="sequential">\n`;
            umlPackagedElements += `\t\t\t\t\t<ownedParameter xmi:id="${opId}_RET" name="return" direction="return" type="${this.getEaTypeReference(retType, visibleNodes, nodeEaIdMap)}"/>\n`;

            if (method.parameters?.trim()) {
              method.parameters.split(',').forEach((paramStr, pIdx) => {
                const [rawPName, rawPType] = paramStr.split(':');
                const pName = rawPName?.trim() || `param${pIdx + 1}`;
                const pType = rawPType?.trim() || 'String';
                umlPackagedElements += `\t\t\t\t\t<ownedParameter xmi:id="${opId}_P${pIdx}" name="${this.escapeXml(pName)}" type="${this.getEaTypeReference(pType, visibleNodes, nodeEaIdMap)}"/>\n`;
              });
            }
            umlPackagedElements += `\t\t\t\t</ownedOperation>\n`;

            eaOperationsXml += `\t\t\t\t\t<operation xmi:idref="${opId}" name="${this.escapeXml(method.name)}" scope="${this.capitalize(visWord)}">\n`;
            eaOperationsXml += `\t\t\t\t\t\t<properties position="${i}"/>\n`;
            eaOperationsXml += `\t\t\t\t\t\t<type type="${this.escapeXml(retType)}" isAbstract="${elType === 'INTERFACE' ? 'true' : 'false'}"/>\n`;
            eaOperationsXml += `\t\t\t\t\t</operation>\n`;
          });
        }

        const outGens = validConnections.filter((c) => {
          const s = c.sourceNodeId || c.sourceId?.replace(/_(top|bottom|left|right)$/, '');
          return s === node.id && c.type === 'generalization';
        });
        outGens.forEach((gen, gIdx) => {
          const targetId = gen.targetNodeId || gen.targetId?.replace(/_(top|bottom|left|right)$/, '');
          const tgtEaId = nodeEaIdMap.get(targetId);
          if (tgtEaId) {
            umlPackagedElements += `\t\t\t\t<generalization xmi:type="uml:Generalization" xmi:id="EAID_GEN_${this.normalizeToken(`${node.id}_${gIdx}`)}" general="${tgtEaId}"/>\n`;
          }
        });

        umlPackagedElements += `\t\t\t</packagedElement>\n`;

        eaElementsXml += `\t\t\t<element xmi:idref="${eaId}" xmi:type="${umlXmiType}" name="${this.escapeXml(node.name)}" scope="public">\n`;
        eaElementsXml += `\t\t\t\t<model package="EAPK_${pkgGuid}" tpos="0" ea_eleType="element"/>\n`;
        eaElementsXml += `\t\t\t\t<properties isSpecification="false" sType="${eaSType}" nType="0" scope="public"${effStereo ? ` stereotype="${this.escapeXml(effStereo)}"` : ''} isAbstract="${elType === 'INTERFACE' ? 'true' : 'false'}"/>\n`;
        if (eaAttributesXml) {
          eaElementsXml += `\t\t\t\t<attributes>\n${eaAttributesXml}\t\t\t\t</attributes>\n`;
        }
        if (eaOperationsXml) {
          eaElementsXml += `\t\t\t\t<operations>\n${eaOperationsXml}\t\t\t\t</operations>\n`;
        }
        eaElementsXml += `\t\t\t</element>\n`;
      }

      const left = Math.max(20, Math.round(node.position?.x || 50));
      const top = Math.max(20, Math.round(node.position?.y || 50));
      const width = Math.max(160, Math.round(node.width || 220));
      const height = Math.max(80, Math.round(node.height || this.estimateHeight(node)));
      eaDiagramElementsXml += `\t\t\t\t\t<element geometry="Left=${left};Top=${top};Right=${left + width};Bottom=${top + height};" subject="${eaId}" seqno="${seqno}" style="DUID=${duid};"/>\n`;
      seqno++;
    }

    for (const conn of validConnections) {
      const connEaId = connEaIdMap.get(conn.id)!;
      const sourceId = conn.sourceNodeId || conn.sourceId?.replace(/_(top|bottom|left|right)$/, '');
      const targetId = conn.targetNodeId || conn.targetId?.replace(/_(top|bottom|left|right)$/, '');
      const sourceEaId = nodeEaIdMap.get(sourceId)!;
      const targetEaId = nodeEaIdMap.get(targetId)!;
      const sourceDuid = nodeDuidMap.get(sourceId)!;
      const targetDuid = nodeDuidMap.get(targetId)!;

      const sName = visibleNodes.find((n) => n.id === sourceId)?.name || 'Source';
      const tName = visibleNodes.find((n) => n.id === targetId)?.name || 'Target';
      const sMult = conn.sourceMultiplicity || '';
      const tMult = conn.targetMultiplicity || '';
      const connName = conn.name || '';
      const eaRelType = this.mapRelType(conn.type);
      const aggregationType = conn.type === 'composition' ? 'composite' : conn.type === 'aggregation' ? 'shared' : 'none';

      if (conn.type !== 'generalization' && conn.type !== 'realization' && conn.type !== 'dependency') {
        const dstPropId = `${connEaId}_dst`;
        const srcPropId = `${connEaId}_src`;
        umlPackagedElements += `\t\t\t<packagedElement xmi:type="uml:Association" xmi:id="${connEaId}" name="${this.escapeXml(connName)}" visibility="public">\n`;
        umlPackagedElements += `\t\t\t\t<memberEnd xmi:idref="${srcPropId}"/>\n`;
        umlPackagedElements += `\t\t\t\t<memberEnd xmi:idref="${dstPropId}"/>\n`;
        umlPackagedElements += `\t\t\t\t<ownedEnd xmi:type="uml:Property" xmi:id="${srcPropId}" visibility="public" association="${connEaId}" aggregation="none">\n`;
        umlPackagedElements += `\t\t\t\t\t<type xmi:idref="${sourceEaId}"/>\n`;
        if (sMult) umlPackagedElements += this.buildMultiplicityXml(sMult, `${srcPropId}`);
        umlPackagedElements += `\t\t\t\t</ownedEnd>\n`;
        umlPackagedElements += `\t\t\t\t<ownedEnd xmi:type="uml:Property" xmi:id="${dstPropId}" visibility="public" association="${connEaId}" aggregation="${aggregationType}">\n`;
        umlPackagedElements += `\t\t\t\t\t<type xmi:idref="${targetEaId}"/>\n`;
        if (tMult) umlPackagedElements += this.buildMultiplicityXml(tMult, `${dstPropId}`);
        umlPackagedElements += `\t\t\t\t</ownedEnd>\n`;
        umlPackagedElements += `\t\t\t</packagedElement>\n`;
      }

      const linemode = this.mapLineStyleToEaMode(conn.lineStyle || defaultLineStyle);
      eaConnectorsXml += `\t\t\t<connector xmi:idref="${connEaId}">\n`;
      eaConnectorsXml += `\t\t\t\t<source xmi:idref="${sourceEaId}">\n`;
      eaConnectorsXml += `\t\t\t\t\t<model type="Class" name="${this.escapeXml(sName)}"/>\n`;
      eaConnectorsXml += `\t\t\t\t\t<type ${sMult ? `multiplicity="${this.escapeXml(sMult)}" ` : ''}aggregation="${aggregationType}" containment="Unspecified"/>\n`;
      eaConnectorsXml += `\t\t\t\t</source>\n`;
      eaConnectorsXml += `\t\t\t\t<target xmi:idref="${targetEaId}">\n`;
      eaConnectorsXml += `\t\t\t\t\t<model type="Class" name="${this.escapeXml(tName)}"/>\n`;
      eaConnectorsXml += `\t\t\t\t\t<type ${tMult ? `multiplicity="${this.escapeXml(tMult)}" ` : ''}aggregation="none" containment="Unspecified"/>\n`;
      eaConnectorsXml += `\t\t\t\t</target>\n`;
      eaConnectorsXml += `\t\t\t\t<properties ea_type="${eaRelType}" direction="Unspecified"/>\n`;
      eaConnectorsXml += `\t\t\t\t<appearance linemode="${linemode}" linecolor="-1" linewidth="0"/>\n`;
      eaConnectorsXml += `\t\t\t\t<labels ${sMult ? `lb="${this.escapeXml(sMult)}"` : ''} ${tMult ? `rb="${this.escapeXml(tMult)}"` : ''} ${connName ? `mb="${this.escapeXml(connName)}"` : ''}/>\n`;
      eaConnectorsXml += `\t\t\t</connector>\n`;

      eaDiagramElementsXml += `\t\t\t\t\t<element geometry="SX=0;SY=0;EX=0;EY=0;EDGE=2;" subject="${connEaId}" style="Mode=${linemode};EOID=${targetDuid};SOID=${sourceDuid};"/>\n`;
    }

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<xmi:XMI xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">`,
      `\t<xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5" exporterID="1716"/>`,
      `\t<uml:Model xmi:type="uml:Model" name="${this.escapeXml(packageName)}" visibility="public">`,
      `\t\t<packagedElement xmi:type="uml:Package" xmi:id="EAPK_${pkgGuid}" name="${this.escapeXml(packageName)}" visibility="public">`,
      umlPackagedElements.trimEnd(),
      `\t\t</packagedElement>`,
      `\t</uml:Model>`,
      `\t<xmi:Extension extender="Enterprise Architect" extenderID="6.5">`,
      `\t\t<elements>`,
      eaElementsXml.trimEnd(),
      `\t\t</elements>`,
      `\t\t<connectors>`,
      eaConnectorsXml.trimEnd(),
      `\t\t</connectors>`,
      `\t\t<primitivetypes>`,
      `\t\t\t<packagedElement xmi:type="uml:Package" xmi:id="EAJavaTypesPackage" name="EA_Java_Types_Package" visibility="public">`,
      `\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_uuid" name="UUID" visibility="public"/>`,
      `\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_String" name="String" visibility="public"/>`,
      `\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_int" name="Integer" visibility="public"/>`,
      `\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_long" name="Long" visibility="public"/>`,
      `\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_boolean" name="Boolean" visibility="public"/>`,
      `\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_double" name="Double" visibility="public"/>`,
      `\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_float" name="Float" visibility="public"/>`,
      `\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_Date" name="Date" visibility="public"/>`,
      `\t\t\t\t<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAJava_void" name="void" visibility="public"/>`,
      `\t\t\t</packagedElement>`,
      `\t\t</primitivetypes>`,
      `\t\t<diagrams>`,
      `\t\t\t<diagram xmi:id="EAID_${diagramGuid}">`,
      `\t\t\t\t<model package="EAPK_${pkgGuid}" localID="1" owner="EAPK_${pkgGuid}" tpos="0"/>`,
      `\t\t\t\t<properties name="${this.escapeXml(packageName)}" type="Logical"/>`,
      `\t\t\t\t<project author="CASE Studio AI" version="1.0" created="${now}" modified="${now}"/>`,
      `\t\t\t\t<elements>`,
      eaDiagramElementsXml.trimEnd(),
      `\t\t\t\t</elements>`,
      `\t\t\t</diagram>`,
      `\t\t</diagrams>`,
      `\t</xmi:Extension>`,
      `</xmi:XMI>`,
    ].join('\n');
  }

  /**
   * Valida sintaxis XML, conformidad OMG XMI 2.1, bloque geométrico EA y ejecuta una prueba round-trip de re-importación.
   */
  validateXmi(xmlContent: string): XmiValidationReport {
    const checks: XmiValidationCheck[] = [];
    let isValid = true;

    if (!xmlContent || !xmlContent.trim()) {
      return {
        isValid: false,
        totalElements: 0,
        totalClasses: 0,
        totalInterfaces: 0,
        totalEnums: 0,
        totalNotes: 0,
        totalRelations: 0,
        roundTripVerified: false,
        checks: [{ title: 'Documento vacío', status: 'fail', detail: 'El contenido XML/XMI está vacío.' }],
      };
    }

    // 1. Chequeo sintáctico XML
    let doc: Document | null = null;
    if (typeof DOMParser !== 'undefined') {
      const domParser = new DOMParser();
      doc = domParser.parseFromString(xmlContent, 'application/xml');
      const parserErr = doc.getElementsByTagName('parsererror');
      if (parserErr && parserErr.length > 0) {
        checks.push({
          title: 'Sintaxis XML Bien Formada',
          status: 'fail',
          detail: parserErr[0].textContent || 'Error de sintaxis XML.',
        });
        return {
          isValid: false,
          totalElements: 0,
          totalClasses: 0,
          totalInterfaces: 0,
          totalEnums: 0,
          totalNotes: 0,
          totalRelations: 0,
          roundTripVerified: false,
          checks,
        };
      }
      checks.push({
        title: 'Sintaxis XML Bien Formada',
        status: 'pass',
        detail: 'Etiquetas, encoding y atributos XML válidos sin errores de parseo.',
      });
    }

    // 2. Estándar OMG XMI 2.1 / UML 2.1+
    const hasXmiVersion = /xmi:version\s*=\s*["']2\./i.test(xmlContent);
    const hasUmlNs = xmlContent.includes('schema.omg.org/spec/UML');
    if (hasXmiVersion && hasUmlNs) {
      checks.push({
        title: 'Estándar OMG XMI 2.1 / UML 2.5',
        status: 'pass',
        detail: 'Namespaces oficiales xmlns:uml y xmi:version="2.1" verificados.',
      });
    } else {
      checks.push({
        title: 'Estándar OMG XMI',
        status: 'warning',
        detail: 'Encabezado XMI detectado, pero falta namespace UML o versión OMG 2.1.',
      });
    }

    // 3. Prueba real round-trip con XmiClientParser
    let roundTripVerified = false;
    let totalClasses = 0;
    let totalInterfaces = 0;
    let totalEnums = 0;
    let totalNotes = 0;
    let totalRelations = 0;

    try {
      const reparsed = XmiClientParser.parse(xmlContent);
      roundTripVerified = true;
      for (const n of reparsed.nodes) {
        const et = (n.elementType || 'CLASS').toUpperCase();
        if (et === 'INTERFACE') totalInterfaces++;
        else if (et === 'ENUM') totalEnums++;
        else if (et === 'NOTE') totalNotes++;
        else totalClasses++;
      }
      totalRelations = reparsed.connections.length;

      if (reparsed.nodes.length > 0) {
        checks.push({
          title: `Elementos UML Reconocidos (${reparsed.nodes.length})`,
          status: 'pass',
          detail: `${totalClasses} clases, ${totalInterfaces} interfaces, ${totalEnums} enums, ${totalNotes} notas.`,
        });
      } else {
        isValid = false;
        checks.push({
          title: 'Elementos UML Reconocidos',
          status: 'fail',
          detail: 'No se encontraron clases, interfaces, enumeraciones ni notas válidas.',
        });
      }

      checks.push({
        title: `Prueba Round-Trip de Re-importación`,
        status: 'pass',
        detail: `AST reconstruido satisfactoriamente (${reparsed.nodes.length} nodos, ${totalRelations} relaciones).`,
      });
    } catch (err: any) {
      isValid = false;
      checks.push({
        title: 'Prueba Round-Trip de Re-importación',
        status: 'fail',
        detail: err?.message || 'Error al re-importar el XMI en el parser cliente.',
      });
    }

    // 4. Extensión gráfica Enterprise Architect
    const hasEaGeometry = xmlContent.includes('extender="Enterprise Architect"') && /Left=-?\d+;Top=-?\d+/.test(xmlContent);
    if (hasEaGeometry) {
      checks.push({
        title: 'Extensiones Sparx Enterprise Architect',
        status: 'pass',
        detail: 'Incluye <xmi:Extension> con coordenadas Left/Top/Right/Bottom y estilos de conector.',
      });
    } else {
      checks.push({
        title: 'Extensiones Sparx Enterprise Architect',
        status: 'warning',
        detail: 'No se detectó bloque de geometría EA; al importar se distribuirá en cuadrícula automática.',
      });
    }

    return {
      isValid,
      totalElements: totalClasses + totalInterfaces + totalEnums + totalNotes,
      totalClasses,
      totalInterfaces,
      totalEnums,
      totalNotes,
      totalRelations,
      roundTripVerified,
      checks,
    };
  }

  private getEaTypeReference(
    typeName: string,
    visibleNodes: UmlClassNode[],
    nodeEaIdMap: Map<string, string>,
  ): string {
    const matchedNode = visibleNodes.find(
      (n) => (n.name || '').trim().toLowerCase() === (typeName || '').trim().toLowerCase(),
    );
    if (matchedNode && nodeEaIdMap.has(matchedNode.id)) {
      return nodeEaIdMap.get(matchedNode.id)!;
    }
    const lower = (typeName || '').toLowerCase().trim();
    if (lower.includes('uuid')) return 'EAJava_uuid';
    if (lower.includes('string') || lower.includes('text')) return 'EAJava_String';
    if (lower === 'int' || lower === 'integer') return 'EAJava_int';
    if (lower === 'long') return 'EAJava_long';
    if (lower.includes('bool')) return 'EAJava_boolean';
    if (lower.includes('double') || lower.includes('decimal') || lower.includes('numeric')) return 'EAJava_double';
    if (lower === 'float') return 'EAJava_float';
    if (lower.includes('date') || lower.includes('time')) return 'EAJava_Date';
    if (lower === 'void') return 'EAJava_void';
    return 'EAJava_String';
  }

  private buildMultiplicityXml(mult: string, prefix: string): string {
    const m = mult.trim();
    let lower = '1';
    let upper = '1';
    if (m === '*' || m === '0..*' || m === '0..n') {
      lower = '0';
      upper = '-1';
    } else if (m === '1..*' || m === '1..n') {
      lower = '1';
      upper = '-1';
    } else if (m === '0..1') {
      lower = '0';
      upper = '1';
    } else if (m.includes('..')) {
      const [l, u] = m.split('..');
      lower = l?.trim() || '1';
      upper = u?.trim() === '*' ? '-1' : u?.trim() || '1';
    }
    const upperType = upper === '-1' ? 'LiteralUnlimitedNatural' : 'LiteralInteger';
    return `\t\t\t\t\t<lowerValue xmi:type="uml:LiteralInteger" xmi:id="${prefix}_L" value="${lower}"/>\n\t\t\t\t\t<upperValue xmi:type="uml:${upperType}" xmi:id="${prefix}_U" value="${upper}"/>\n`;
  }

  private mapLineStyleToEaMode(lineStyle?: UmlLineStyle): string {
    switch (lineStyle) {
      case 'straight':
        return '1';
      case 'bezier':
        return '4';
      case 'adaptive-curve':
        return '10';
      case 'segment':
      default:
        return '3';
    }
  }

  private mapRelType(type: string): string {
    switch (type) {
      case 'generalization':
        return 'Generalization';
      case 'realization':
        return 'Realisation';
      case 'dependency':
        return 'Dependency';
      default:
        return 'Association';
    }
  }

  private visibilityWord(vis: string | undefined, fallback: 'public' | 'private'): string {
    const v = (vis || '').trim().toLowerCase();
    if (v === '+' || v === 'public') return 'public';
    if (v === '-' || v === 'private') return 'private';
    if (v === '#' || v === 'protected') return 'protected';
    if (v === '~' || v === 'package') return 'package';
    return fallback;
  }

  private estimateHeight(node: UmlClassNode): number {
    const attrCount = node.attributes?.length || 0;
    const methodCount = node.methods?.length || 0;
    return 36 + Math.max(1, attrCount) * 22 + methodCount * 22 + 16;
  }

  private normalizeToken(raw: string): string {
    return (raw || 'EL').replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private makeId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  }

  private shortHash(seed: string): string {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
  }

  private capitalize(str: string): string {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  private escapeXml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

