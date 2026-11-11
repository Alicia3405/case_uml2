import '../models/uml_models.dart';

class UmlAuditIssue {
  final String severity; // 'error' | 'warning' | 'info'
  final String title;
  final String detail;
  final String? nodeName;

  const UmlAuditIssue({
    required this.severity,
    required this.title,
    required this.detail,
    this.nodeName,
  });
}

/// Validador local de consistencia UML/JPA (equivalente móvil de `UmlAuditService`).
class UmlAuditHelper {
  static List<UmlAuditIssue> auditDiagram(UmlDiagram diagram) {
    final issues = <UmlAuditIssue>[];
    final nodes = diagram.visibleNodes;

    if (nodes.isEmpty) {
      issues.add(
        const UmlAuditIssue(
          severity: 'warning',
          title: 'Diagrama vacío',
          detail: 'Agrega al menos una clase UML antes de generar código Spring Boot o Flutter.',
        ),
      );
      return issues;
    }

    final seenNames = <String>{};
    for (final node in nodes) {
      final cleanName = node.name.trim();
      final lower = cleanName.toLowerCase();

      if (node.elementType != UmlElementType.note) {
        if (!seenNames.add(lower)) {
          issues.add(
            UmlAuditIssue(
              severity: 'error',
              title: 'Nombre duplicado: $cleanName',
              detail: 'Existen múltiples elementos llamados "$cleanName" en el mismo diagrama.',
              nodeName: cleanName,
            ),
          );
        }

        if (node.elementType == UmlElementType.umlClass) {
          final hasPk = node.attributes.any((a) => a.isPrimaryKey);
          if (!hasPk) {
            issues.add(
              UmlAuditIssue(
                severity: 'warning',
                title: '$cleanName sin clave primaria [PK]',
                detail: 'Las entidades JPA requieren al menos un atributo marcado como [PK].',
                nodeName: cleanName,
              ),
            );
          }

          if (node.attributes.isEmpty) {
            issues.add(
              UmlAuditIssue(
                severity: 'warning',
                title: '$cleanName sin atributos',
                detail: 'Agrega atributos para generar columnas SQL y formularios útiles.',
                nodeName: cleanName,
              ),
            );
          }
        }
      }
    }

    for (final conn in diagram.connections) {
      if (conn.sourceNodeId == conn.targetNodeId &&
          conn.type == UmlRelationType.generalization) {
        issues.add(
          const UmlAuditIssue(
            severity: 'error',
            title: 'Auto-herencia inválida',
            detail: 'Una clase no puede heredar de sí misma.',
          ),
        );
      }
    }

    if (issues.isEmpty) {
      issues.add(
        const UmlAuditIssue(
          severity: 'info',
          title: 'Auditoría UML aprobada',
          detail: 'Todas las clases, claves primarias y relaciones cumplen las reglas de validación.',
        ),
      );
    }

    return issues;
  }
}

