import 'package:flutter/material.dart';
import '../models/uml_models.dart';

/// Estima la altura visual aproximada de un nodo UML para enrutar conectores.
double estimateNodeHeight(UmlNode node) {
  final footerH = node.authorBadgeName != null ? 20.0 : 0.0;
  if (node.elementType == UmlElementType.note) {
    final textLen = (node.noteContent ?? node.name).length;
    final lines = (textLen / 26).ceil().clamp(2, 6);
    return 56.0 + lines * 18.0 + footerH;
  }
  const headerH = 48.0;
  final attrH = (node.attributes.isEmpty ? 1 : node.attributes.length) * 20.0 + 14.0;
  final methodH = node.elementType == UmlElementType.umlEnum
      ? 0.0
      : (node.methods.isEmpty ? 0.0 : node.methods.length * 20.0 + 14.0);
  return (headerH + attrH + methodH + footerH).clamp(96.0, 540.0);
}

Color parseHexColor(String hex, {Color fallback = const Color(0xFF38BDF8)}) {
  try {
    final clean = hex.replaceFirst('#', '').trim();
    if (clean.length == 6) {
      return Color(int.parse('FF$clean', radix: 16));
    }
    if (clean.length == 8) {
      return Color(int.parse(clean, radix: 16));
    }
  } catch (_) {}
  return fallback;
}

/// Caja UML interactiva para `CLASS`, `INTERFACE`, `ENUM`, `NOTE` y `ASSOCIATION_CLASS`
/// con indicador visual de bloqueo mutuo WebSocket, autoría y notas IA en pizarra.
class UmlNodeBox extends StatelessWidget {
  final UmlNode node;
  final bool isSelected;
  final CollabNodeLock? lockedByOther;
  final List<AiAnnotationItem> openAnnotations;
  final VoidCallback? onAnnotationsTap;

  const UmlNodeBox({
    super.key,
    required this.node,
    this.isSelected = false,
    this.lockedByOther,
    this.openAnnotations = const [],
    this.onAnnotationsTap,
  });

  Color _headerColor() {
    switch (node.elementType) {
      case UmlElementType.umlInterface:
        return const Color(0xFF0E7490);
      case UmlElementType.umlEnum:
        return const Color(0xFF6D28D9);
      case UmlElementType.note:
        return const Color(0xFFB45309);
      case UmlElementType.associationClass:
        return const Color(0xFF047857);
      case UmlElementType.umlClass:
        return const Color(0xFF1E3A8A);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lockColor =
        lockedByOther != null ? parseHexColor(lockedByOther!.color) : null;
    final borderColor = lockColor ??
        (isSelected
            ? const Color(0xFF38BDF8)
            : (node.elementType == UmlElementType.note
                ? const Color(0xFFF59E0B)
                : const Color(0xFF334155)));

    if (node.elementType == UmlElementType.note) {
      return SizedBox(
        width: node.width.clamp(190.0, 320.0),
        child: Container(
          decoration: BoxDecoration(
            color: const Color(0xFF422006).withValues(alpha: 0.94),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: borderColor,
              width: isSelected || lockColor != null ? 2.2 : 1.4,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.38),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (lockedByOther != null) _LockChip(lock: lockedByOther!),
              Row(
                children: [
                  const Icon(Icons.sticky_note_2_outlined,
                      size: 15, color: Color(0xFFFBBF24)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      node.name.isEmpty ? 'Nota' : node.name,
                      style: const TextStyle(
                        color: Color(0xFFFDE68A),
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                (node.noteContent ?? '').trim().isEmpty
                    ? 'Toca para redactar nota UML...'
                    : node.noteContent!,
                style: const TextStyle(
                  color: Color(0xFFFEF3C7),
                  fontSize: 11.5,
                  height: 1.35,
                ),
              ),
              if (node.authorBadgeName != null) ...[
                const SizedBox(height: 6),
                _AuthorFooter(authorName: node.authorBadgeName!, isNote: true),
              ],
            ],
          ),
        ),
      );
    }

    return SizedBox(
      width: node.width.clamp(200.0, 320.0),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: borderColor,
            width: isSelected || lockColor != null ? 2.4 : 1.4,
          ),
          boxShadow: [
            BoxShadow(
              color: (lockColor ?? const Color(0xFF020617)).withValues(alpha: 0.45),
              blurRadius: 12,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (lockedByOther != null) _LockChip(lock: lockedByOther!),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    _headerColor(),
                    _headerColor().withValues(alpha: 0.72),
                  ],
                ),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Flexible(
                        child: Text(
                          node.displayStereotype,
                          style: TextStyle(
                            fontSize: 10,
                            color: Colors.white.withValues(alpha: 0.8),
                            fontStyle: FontStyle.italic,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (openAnnotations.isNotEmpty) ...[
                        const SizedBox(width: 6),
                        GestureDetector(
                          onTap: onAnnotationsTap,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: const Color(0xFF8B5CF6),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '💡 ${openAnnotations.length}',
                              style: const TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  Text(
                    node.name,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      fontStyle: node.elementType == UmlElementType.umlInterface
                          ? FontStyle.italic
                          : FontStyle.normal,
                      color: Colors.white,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: Color(0xFF334155)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              color: const Color(0xFF1E293B),
              child: node.attributes.isEmpty
                  ? const Text(
                      '(sin atributos)',
                      style: TextStyle(
                        fontSize: 11,
                        color: Color(0xFF64748B),
                        fontStyle: FontStyle.italic,
                      ),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: node.attributes.map((attr) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 1.5),
                          child: Row(
                            children: [
                              if (attr.isPrimaryKey)
                                Container(
                                  margin: const EdgeInsets.only(right: 4),
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 4, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF59E0B)
                                        .withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(4),
                                    border: Border.all(
                                      color: const Color(0xFFF59E0B)
                                          .withValues(alpha: 0.65),
                                    ),
                                  ),
                                  child: const Text(
                                    'PK',
                                    style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w800,
                                      color: Color(0xFFFBBF24),
                                    ),
                                  ),
                                ),
                              Expanded(
                                child: Text(
                                  node.elementType == UmlElementType.umlEnum
                                      ? attr.name
                                      : '${attr.visibility.symbol} ${attr.name}: ${attr.type}${attr.isNullable && !attr.isPrimaryKey ? '?' : ''}',
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    fontFamily: 'monospace',
                                    color: attr.isPrimaryKey
                                        ? const Color(0xFFFDE68A)
                                        : const Color(0xFFE2E8F0),
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
            ),
            if (node.elementType != UmlElementType.umlEnum &&
                node.methods.isNotEmpty) ...[
              const Divider(height: 1, color: Color(0xFF334155)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                color: const Color(0xFF0F172A),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: node.methods.map((m) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 1.5),
                      child: Text(
                        '${m.visibility.symbol} ${m.name}(${m.parameters}): ${m.returnType}',
                        style: const TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: Color(0xFF93C5FD),
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
            if (node.authorBadgeName != null) ...[
              const Divider(height: 1, color: Color(0xFF1E293B)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                child: _AuthorFooter(authorName: node.authorBadgeName!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AuthorFooter extends StatelessWidget {
  final String authorName;
  final bool isNote;

  const _AuthorFooter({required this.authorName, this.isNote = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          Icons.person_outline,
          size: 11,
          color: isNote ? const Color(0xFFFCD34D) : const Color(0xFF94A3B8),
        ),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            'Por: $authorName',
            style: TextStyle(
              fontSize: 9.5,
              color: isNote ? const Color(0xFFFDE68A) : const Color(0xFF94A3B8),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

class _LockChip extends StatelessWidget {
  final CollabNodeLock lock;
  const _LockChip({required this.lock});

  @override
  Widget build(BuildContext context) {
    final c = parseHexColor(lock.color);
    return Container(
      width: double.infinity,
      color: c.withValues(alpha: 0.24),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.lock_outline, size: 11, color: c),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              'Editando: ${lock.userName}',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: c,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

