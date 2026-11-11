import 'dart:ui';
import 'package:uuid/uuid.dart';
import '../models/uml_models.dart';

class VoiceCommandResult {
  final bool success;
  final bool isUndo;
  final String speechResponse;
  final String commandDescription;

  VoiceCommandResult({
    required this.success,
    this.isUndo = false,
    required this.speechResponse,
    required this.commandDescription,
  });
}

/// Motor atómico local de comandos de voz UML en tiempo real (offline-first).
/// Soporta creación de clases/interfaces/enums/notas, atributos [PK], métodos,
/// todos los tipos de relación UML y edición quirúrgica sin depender de red.
class UmlVoiceCommander {
  static const _uuid = Uuid();

  static String _shortId(String prefix) =>
      '${prefix}_${_uuid.v4().replaceAll('-', '').substring(0, 12)}';

  static String stripAccents(String s) {
    return s
        .toLowerCase()
        .replaceAll(RegExp(r'[áàäâ]'), 'a')
        .replaceAll(RegExp(r'[éèëê]'), 'e')
        .replaceAll(RegExp(r'[íìïî]'), 'i')
        .replaceAll(RegExp(r'[óòöô]'), 'o')
        .replaceAll(RegExp(r'[úùüû]'), 'u')
        .replaceAll(RegExp(r'[ñ]'), 'n')
        .trim();
  }

  static bool _equalsNormalized(String a, String b) =>
      stripAccents(a) == stripAccents(b);

  static VoiceCommandResult executeCommand(String speechText, UmlDiagram diagram) {
    final clean = speechText.trim();
    final cleanLower = stripAccents(clean);

    if (cleanLower == 'deshacer' ||
        cleanLower.contains('deshacer ultimo') ||
        cleanLower.contains('revertir')) {
      return VoiceCommandResult(
        success: true,
        isUndo: true,
        speechResponse: 'Revirtiendo el último cambio realizado en el diagrama.',
        commandDescription: 'Deshacer',
      );
    }

    // 0. Limpiar lienzo
    if (cleanLower.contains('limpiar lienzo') ||
        cleanLower.contains('borrar todo') ||
        cleanLower.contains('reiniciar diagrama') ||
        cleanLower.contains('limpiar todo')) {
      diagram.nodes.clear();
      diagram.connections.clear();
      diagram.updatedAt = DateTime.now();
      return VoiceCommandResult(
        success: true,
        speechResponse: 'Lienzo limpiado por completo.',
        commandDescription: 'Limpiar lienzo',
      );
    }

    // 1. Renombrar clase / interfaz / enum
    final renameMatch = RegExp(
      r'\b(?:renombrar|cambiar\s+nombre\s+de)\s+(?:la\s+)?(?:clase|tabla|entidad|interfaz|interface|enum)?\s*([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\s+(?:a|por)\s+([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\b',
      caseSensitive: false,
    ).firstMatch(clean);
    if (renameMatch != null) {
      final oldName = renameMatch.group(1)!;
      final newName = _capitalize(renameMatch.group(2)!);
      final target = diagram.nodes
          .where((n) => !n.isAnchor && _equalsNormalized(n.name, oldName))
          .firstOrNull;
      if (target != null) {
        final previous = target.name;
        target.name = newName;
        diagram.updatedAt = DateTime.now();
        return VoiceCommandResult(
          success: true,
          speechResponse: '$previous renombrada a $newName.',
          commandDescription: 'Renombrar $previous -> $newName',
        );
      }
    }

    // 2. Crear Interfaz, Enum, Nota o Clase
    final createMatch = RegExp(
      r'\b(?:crear|agrega|agregar|nueva|nuevo|insertar)\s+(?:una\s+|un\s+)?(clase|tabla|entidad|interfaz|interface|enum|enumeracion|nota)\s+([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_ ]+)\b',
      caseSensitive: false,
    ).firstMatch(clean);
    if (createMatch != null) {
      final kindRaw = stripAccents(createMatch.group(1)!);
      final rawName = createMatch.group(2)!.trim();
      final tokenName = rawName.split(RegExp(r'\s+')).first;
      final elementName = _capitalize(tokenName);

      UmlElementType elType = UmlElementType.umlClass;
      String? stereotype;
      String? noteContent;
      if (kindRaw == 'interfaz' || kindRaw == 'interface') {
        elType = UmlElementType.umlInterface;
        stereotype = '«interface»';
      } else if (kindRaw == 'enum' || kindRaw == 'enumeracion') {
        elType = UmlElementType.umlEnum;
        stereotype = '«enumeration»';
      } else if (kindRaw == 'nota') {
        elType = UmlElementType.note;
        noteContent = rawName;
      }

      final exists = diagram.nodes.any(
        (n) => !n.isAnchor && _equalsNormalized(n.name, elementName),
      );
      if (exists && elType != UmlElementType.note) {
        return VoiceCommandResult(
          success: false,
          speechResponse: '$elementName ya existe en el lienzo.',
          commandDescription: 'Elemento $elementName ya existente',
        );
      }

      final idx = diagram.visibleNodes.length;
      final pos = Offset(80.0 + (idx % 3) * 270.0, 80.0 + (idx ~/ 3) * 240.0);

      final attrs = elType == UmlElementType.note
          ? <UmlAttribute>[]
          : elType == UmlElementType.umlEnum
              ? [
                  UmlAttribute(name: 'ACTIVO', type: 'EnumConstant', visibility: UmlVisibility.public, orderIndex: 0),
                  UmlAttribute(name: 'INACTIVO', type: 'EnumConstant', visibility: UmlVisibility.public, orderIndex: 1),
                ]
              : [
                  UmlAttribute(
                    name: 'id',
                    type: 'UUID',
                    isPrimaryKey: true,
                    isNullable: false,
                    orderIndex: 0,
                  ),
                  UmlAttribute(
                    name: 'nombre',
                    type: 'String',
                    orderIndex: 1,
                  ),
                ];

      diagram.nodes.add(
        UmlNode(
          id: _shortId('mob'),
          name: elType == UmlElementType.note ? 'Nota' : elementName,
          elementType: elType,
          stereotype: stereotype,
          noteContent: noteContent,
          position: pos,
          attributes: attrs,
          methods: elType == UmlElementType.umlClass || elType == UmlElementType.umlInterface
              ? [UmlMethod(name: 'procesar', returnType: 'void', orderIndex: 0)]
              : [],
        ),
      );
      diagram.updatedAt = DateTime.now();

      return VoiceCommandResult(
        success: true,
        speechResponse: '${elType.label} $elementName creada en el lienzo.',
        commandDescription: 'Crear ${elType.label} $elementName',
      );
    }

    // 3. Eliminar conexión o relación
    final delConnMatch = RegExp(
      r'\b(?:eliminar|borrar|quitar|desconectar)\s+(?:conexi[oó]n|relaci[oó]n|v[ií]nculo)?\s*(?:de|entre)?\s*([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\s+(?:con|y|a)\s+([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\b',
      caseSensitive: false,
    ).firstMatch(clean);
    if (delConnMatch != null &&
        (cleanLower.contains('conexi') ||
            cleanLower.contains('relaci') ||
            cleanLower.contains('desconectar'))) {
      final srcName = delConnMatch.group(1)!;
      final tgtName = delConnMatch.group(2)!;
      final src = diagram.nodes
          .where((n) => !n.isAnchor && _equalsNormalized(n.name, srcName))
          .firstOrNull;
      final tgt = diagram.nodes
          .where((n) => !n.isAnchor && _equalsNormalized(n.name, tgtName))
          .firstOrNull;

      if (src != null && tgt != null) {
        final before = diagram.connections.length;
        diagram.connections.removeWhere(
          (c) =>
              (c.sourceNodeId == src.id && c.targetNodeId == tgt.id) ||
              (c.sourceNodeId == tgt.id && c.targetNodeId == src.id),
        );
        if (diagram.connections.length < before) {
          diagram.updatedAt = DateTime.now();
          return VoiceCommandResult(
            success: true,
            speechResponse: 'Conexión entre ${src.name} y ${tgt.name} eliminada.',
            commandDescription: 'Eliminar conexión ${src.name} - ${tgt.name}',
          );
        }
      }
    }

    // 4. Conectar o relacionar clases (detectando herencia, composición, agregación, dependencia)
    final connectMatch = RegExp(
      r'\b(?:conectar|relacionar|vincular|asociar|heredar|componer)(?:\s+(?:por\s+|con\s+)?(?:herencia|generalizaci[oó]n|composici[oó]n|agregaci[oó]n|dependencia|realizaci[oó]n|asociaci[oó]n))?\s+(?:la\s+clase\s+|clase\s+)?([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\s+(?:con|a|de)\s+(?:la\s+clase\s+|clase\s+)?([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\b',
      caseSensitive: false,
    ).firstMatch(clean);
    if (connectMatch != null) {
      final srcName = connectMatch.group(1)!;
      final tgtName = connectMatch.group(2)!;
      final src = diagram.nodes
          .where((n) => !n.isAnchor && _equalsNormalized(n.name, srcName))
          .firstOrNull;
      final tgt = diagram.nodes
          .where((n) => !n.isAnchor && _equalsNormalized(n.name, tgtName))
          .firstOrNull;

      if (src == null || tgt == null) {
        return VoiceCommandResult(
          success: false,
          speechResponse: 'No encontré las clases $srcName o $tgtName para conectarlas.',
          commandDescription: 'Clases no encontradas',
        );
      }

      UmlRelationType relType = UmlRelationType.association;
      if (cleanLower.contains('herenc') ||
          cleanLower.contains('hered') ||
          cleanLower.contains('generaliz') ||
          cleanLower.contains('extiend')) {
        relType = UmlRelationType.generalization;
      } else if (cleanLower.contains('compos') || cleanLower.contains('compon')) {
        relType = UmlRelationType.composition;
      } else if (cleanLower.contains('agreg')) {
        relType = UmlRelationType.aggregation;
      } else if (cleanLower.contains('depend')) {
        relType = UmlRelationType.dependency;
      } else if (cleanLower.contains('realiz') || cleanLower.contains('implement')) {
        relType = UmlRelationType.realization;
      }

      diagram.connections.add(
        UmlConnection(
          id: _shortId('conn'),
          sourceNodeId: src.id,
          targetNodeId: tgt.id,
          sourceId: '${src.id}_right',
          targetId: '${tgt.id}_left',
          type: relType,
          name: relType == UmlRelationType.generalization ? null : 'asocia',
          sourceMultiplicity: '1',
          targetMultiplicity:
              relType == UmlRelationType.generalization ? '1' : '0..*',
        ),
      );
      diagram.updatedAt = DateTime.now();

      return VoiceCommandResult(
        success: true,
        speechResponse:
            'Relación ${relType.label} establecida entre ${src.name} y ${tgt.name}.',
        commandDescription: 'Conectar ${src.name} -> ${tgt.name} (${relType.code})',
      );
    }

    // 5. Agregar método
    final addMethodMatch = RegExp(
      r'\b(?:agregar|añadir|crear|nuevo)\s+(?:m[eé]todo|funci[oó]n|operaci[oó]n)\s+([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)(?:\s+(?:tipo|retorno)\s+([a-zA-Z0-9_\[\]]+))?\s+(?:a|en|para)\s+(?:la\s+clase\s+|la\s+tabla\s+|la\s+entidad\s+)?([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\b',
      caseSensitive: false,
    ).firstMatch(clean);
    if (addMethodMatch != null) {
      final methodName = addMethodMatch.group(1)!;
      final returnType = _normalizeType(addMethodMatch.group(2) ?? 'void');
      final targetName = addMethodMatch.group(3)!;

      final target = diagram.nodes
          .where((n) => !n.isAnchor && _equalsNormalized(n.name, targetName))
          .firstOrNull;
      if (target == null) {
        return VoiceCommandResult(
          success: false,
          speechResponse: 'No encontré la clase $targetName para agregar el método.',
          commandDescription: 'Clase no encontrada',
        );
      }

      target.methods.add(
        UmlMethod(
          name: methodName,
          returnType: returnType,
          orderIndex: target.methods.length,
        ),
      );
      diagram.updatedAt = DateTime.now();

      return VoiceCommandResult(
        success: true,
        speechResponse: 'Método $methodName agregado a ${target.name}.',
        commandDescription: 'Agregar método $methodName a ${target.name}',
      );
    }

    // 6. Eliminar método
    final delMethodMatch = RegExp(
      r'\b(?:eliminar|borrar|quitar)\s+(?:m[eé]todo|funci[oó]n|operaci[oó]n)\s+([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\s+(?:de|en)\s+(?:la\s+clase\s+|la\s+tabla\s+)?([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\b',
      caseSensitive: false,
    ).firstMatch(clean);
    if (delMethodMatch != null) {
      final methodName = delMethodMatch.group(1)!;
      final targetName = delMethodMatch.group(2)!;
      final target = diagram.nodes
          .where((n) => !n.isAnchor && _equalsNormalized(n.name, targetName))
          .firstOrNull;
      if (target != null) {
        target.methods.removeWhere((m) => _equalsNormalized(m.name, methodName));
        diagram.updatedAt = DateTime.now();
        return VoiceCommandResult(
          success: true,
          speechResponse: 'Método $methodName eliminado de ${target.name}.',
          commandDescription: 'Eliminar método $methodName',
        );
      }
    }

    // 7. Agregar atributo
    final attrMatch = RegExp(
      r'\b(?:agregar|añadir|nuevo|crear)\s+(?:atributo\s+|campo\s+)?([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)(?:\s+tipo\s+([a-zA-Z0-9_\[\]]+))?\s+(?:a|en|para)\s+(?:la\s+clase\s+|la\s+tabla\s+|la\s+entidad\s+)?([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\b',
      caseSensitive: false,
    ).firstMatch(clean);
    if (attrMatch != null) {
      final attrName = stripAccents(attrMatch.group(1)!);
      final attrType = _normalizeType(attrMatch.group(2) ?? 'String');
      final targetName = attrMatch.group(3)!;

      final target = diagram.nodes
          .where((n) => !n.isAnchor && _equalsNormalized(n.name, targetName))
          .firstOrNull;
      if (target == null) {
        return VoiceCommandResult(
          success: false,
          speechResponse: 'No encontré la clase $targetName para agregar el atributo.',
          commandDescription: 'Clase no encontrada',
        );
      }

      target.attributes.add(
        UmlAttribute(
          name: attrName,
          type: attrType,
          orderIndex: target.attributes.length,
        ),
      );
      diagram.updatedAt = DateTime.now();

      return VoiceCommandResult(
        success: true,
        speechResponse:
            'Atributo $attrName de tipo $attrType agregado a ${target.name}.',
        commandDescription: 'Agregar atributo $attrName a ${target.name}',
      );
    }

    // 8. Eliminar atributo
    final delAttrMatch = RegExp(
      r'\b(?:eliminar|borrar|quitar)\s+(?:atributo\s+|campo\s+)?([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\s+(?:de|en)\s+(?:la\s+clase\s+|la\s+tabla\s+)?([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\b',
      caseSensitive: false,
    ).firstMatch(clean);
    if (delAttrMatch != null) {
      final attrName = delAttrMatch.group(1)!;
      final targetName = delAttrMatch.group(2)!;
      final target = diagram.nodes
          .where((n) => !n.isAnchor && _equalsNormalized(n.name, targetName))
          .firstOrNull;
      if (target != null) {
        target.attributes.removeWhere((a) => _equalsNormalized(a.name, attrName));
        diagram.updatedAt = DateTime.now();
        return VoiceCommandResult(
          success: true,
          speechResponse: 'Atributo $attrName eliminado de ${target.name}.',
          commandDescription: 'Eliminar atributo $attrName',
        );
      }
    }

    // 9. Eliminar clase
    final delClassMatch = RegExp(
      r'\b(?:eliminar|borrar|quitar)\s+(?:la\s+)?(?:clase|tabla|entidad|interfaz|enum|nota)\s+([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_]+)\b',
      caseSensitive: false,
    ).firstMatch(clean);
    if (delClassMatch != null) {
      final className = delClassMatch.group(1)!;
      final target = diagram.nodes
          .where((n) => !n.isAnchor && _equalsNormalized(n.name, className))
          .firstOrNull;
      if (target != null) {
        diagram.nodes.removeWhere((c) => c.id == target.id);
        diagram.connections.removeWhere(
          (r) => r.sourceNodeId == target.id || r.targetNodeId == target.id,
        );
        diagram.updatedAt = DateTime.now();

        return VoiceCommandResult(
          success: true,
          speechResponse: 'Clase ${target.name} eliminada del lienzo.',
          commandDescription: 'Eliminar ${target.name}',
        );
      }
    }

    return VoiceCommandResult(
      success: false,
      speechResponse:
          'No reconocí "$speechText". Prueba: "Crear clase Factura", "Agregar atributo precio tipo BigDecimal a Factura" o "Conectar Cliente con Factura".',
      commandDescription: 'Comando no reconocido',
    );
  }

  static String _capitalize(String s) =>
      s.isEmpty ? '' : s[0].toUpperCase() + s.substring(1);

  static String _normalizeType(String t) {
    final lower = stripAccents(t);
    if (lower == 'entero' || lower == 'int' || lower == 'integer') return 'Integer';
    if (lower == 'long' || lower == 'bigint') return 'Long';
    if (lower == 'uuid') return 'UUID';
    if (lower == 'double' || lower == 'float') return 'Double';
    if (lower == 'decimal' || lower == 'bigdecimal' || lower == 'precio' || lower == 'monto') {
      return 'BigDecimal';
    }
    if (lower == 'boolean' || lower == 'bool' || lower == 'booleano') return 'Boolean';
    if (lower == 'fecha' || lower == 'date' || lower == 'localdate') return 'LocalDate';
    if (lower == 'fechahora' || lower == 'datetime' || lower == 'localdatetime') {
      return 'LocalDateTime';
    }
    if (lower == 'texto' || lower == 'string' || lower == 'cadena' || lower == 'varchar') {
      return 'String';
    }
    if (lower == 'void' || lower == 'vacio') return 'void';
    return _capitalize(t);
  }
}

