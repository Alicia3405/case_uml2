import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/uml_models.dart';
import 'uml_node_box.dart';

/// Renderiza relaciones UML (`association`, `generalization`, `realization`,
/// `composition`, `aggregation`, `dependency`) con notación estándar OMG UML.
class RelationPainter extends CustomPainter {
  final List<UmlNode> nodes;
  final List<UmlConnection> connections;

  RelationPainter({
    required this.nodes,
    required this.connections,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final nodeMap = {for (final n in nodes) n.id: n};

    for (final conn in connections) {
      final src = nodeMap[conn.sourceNodeId];
      final tgt = nodeMap[conn.targetNodeId];
      if (src == null || tgt == null) continue;

      final srcRect = Rect.fromLTWH(
        src.position.dx,
        src.position.dy,
        src.width.clamp(190.0, 320.0),
        estimateNodeHeight(src),
      );
      final tgtRect = Rect.fromLTWH(
        tgt.position.dx,
        tgt.position.dy,
        tgt.width.clamp(190.0, 320.0),
        estimateNodeHeight(tgt),
      );

      final srcCenter = srcRect.center;
      final tgtCenter = tgtRect.center;
      final start = _intersectRect(srcRect, tgtCenter);
      final end = _intersectRect(tgtRect, srcCenter);

      final color = _colorForRelation(conn.type);
      final strokePaint = Paint()
        ..color = color
        ..strokeWidth = 2.0
        ..style = PaintingStyle.stroke;

      final isDashed = conn.type == UmlRelationType.dependency ||
          conn.type == UmlRelationType.realization ||
          conn.type == UmlRelationType.associationClass;

      if (isDashed) {
        _drawDashedLine(canvas, start, end, strokePaint);
      } else {
        canvas.drawLine(start, end, strokePaint);
      }

      _drawEndMarkers(canvas, start, end, conn.type, color);
      _drawLabels(canvas, start, end, conn);
    }
  }

  Color _colorForRelation(UmlRelationType type) {
    switch (type) {
      case UmlRelationType.generalization:
        return const Color(0xFF38BDF8);
      case UmlRelationType.realization:
        return const Color(0xFF22D3EE);
      case UmlRelationType.composition:
        return const Color(0xFFF472B6);
      case UmlRelationType.aggregation:
        return const Color(0xFFA78BFA);
      case UmlRelationType.dependency:
        return const Color(0xFF94A3B8);
      case UmlRelationType.associationClass:
        return const Color(0xFF34D399);
      case UmlRelationType.association:
        return const Color(0xFFCBD5E1);
    }
  }

  Offset _intersectRect(Rect rect, Offset towards) {
    final c = rect.center;
    final dx = towards.dx - c.dx;
    final dy = towards.dy - c.dy;
    if (dx.abs() < 0.001 && dy.abs() < 0.001) return c;

    final halfW = rect.width / 2;
    final halfH = rect.height / 2;
    final scaleX = dx.abs() > 0.001 ? halfW / dx.abs() : double.infinity;
    final scaleY = dy.abs() > 0.001 ? halfH / dy.abs() : double.infinity;
    final scale = math.min(scaleX, scaleY);

    return Offset(c.dx + dx * scale, c.dy + dy * scale);
  }

  void _drawDashedLine(Canvas canvas, Offset p1, Offset p2, Paint paint) {
    final total = (p2 - p1).distance;
    if (total < 1) return;
    final dir = (p2 - p1) / total;
    const dashLen = 7.0;
    const gapLen = 5.0;
    var dist = 0.0;
    while (dist < total) {
      final endDist = math.min(dist + dashLen, total);
      canvas.drawLine(p1 + dir * dist, p1 + dir * endDist, paint);
      dist += dashLen + gapLen;
    }
  }

  void _drawEndMarkers(
    Canvas canvas,
    Offset start,
    Offset end,
    UmlRelationType type,
    Color color,
  ) {
    final angle = math.atan2(end.dy - start.dy, end.dx - start.dx);
    final fillBg = Paint()
      ..color = const Color(0xFF0B1120)
      ..style = PaintingStyle.fill;
    final fillSolid = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    final border = Paint()
      ..color = color
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke;

    if (type == UmlRelationType.generalization ||
        type == UmlRelationType.realization) {
      final path = _trianglePath(end, angle, 14);
      canvas.drawPath(path, fillBg);
      canvas.drawPath(path, border);
    } else if (type == UmlRelationType.composition ||
        type == UmlRelationType.aggregation) {
      final path = _diamondPath(start, angle, 15);
      canvas.drawPath(
        path,
        type == UmlRelationType.composition ? fillSolid : fillBg,
      );
      canvas.drawPath(path, border);
    } else if (type == UmlRelationType.dependency) {
      _drawOpenArrow(canvas, end, angle, border);
    }
  }

  Path _trianglePath(Offset tip, double angle, double size) {
    final p1 = Offset(
      tip.dx - size * math.cos(angle - math.pi / 6),
      tip.dy - size * math.sin(angle - math.pi / 6),
    );
    final p2 = Offset(
      tip.dx - size * math.cos(angle + math.pi / 6),
      tip.dy - size * math.sin(angle + math.pi / 6),
    );
    return Path()
      ..moveTo(tip.dx, tip.dy)
      ..lineTo(p1.dx, p1.dy)
      ..lineTo(p2.dx, p2.dy)
      ..close();
  }

  Path _diamondPath(Offset tip, double angle, double len) {
    final half = len / 2;
    final ortho = angle + math.pi / 2;
    final mid = Offset(tip.dx + half * math.cos(angle), tip.dy + half * math.sin(angle));
    final back = Offset(tip.dx + len * math.cos(angle), tip.dy + len * math.sin(angle));
    final side = len * 0.34;
    final left = Offset(mid.dx + side * math.cos(ortho), mid.dy + side * math.sin(ortho));
    final right = Offset(mid.dx - side * math.cos(ortho), mid.dy - side * math.sin(ortho));
    return Path()
      ..moveTo(tip.dx, tip.dy)
      ..lineTo(left.dx, left.dy)
      ..lineTo(back.dx, back.dy)
      ..lineTo(right.dx, right.dy)
      ..close();
  }

  void _drawOpenArrow(Canvas canvas, Offset tip, double angle, Paint paint) {
    const len = 12.0;
    final p1 = Offset(
      tip.dx - len * math.cos(angle - math.pi / 5),
      tip.dy - len * math.sin(angle - math.pi / 5),
    );
    final p2 = Offset(
      tip.dx - len * math.cos(angle + math.pi / 5),
      tip.dy - len * math.sin(angle + math.pi / 5),
    );
    canvas.drawLine(tip, p1, paint);
    canvas.drawLine(tip, p2, paint);
  }

  void _drawLabels(Canvas canvas, Offset start, Offset end, UmlConnection conn) {
    final dist = (end - start).distance;
    if (dist < 40) return;

    final dir = (end - start) / dist;
    final mid = Offset((start.dx + end.dx) / 2, (start.dy + end.dy) / 2);

    if (conn.name != null && conn.name!.trim().isNotEmpty) {
      _drawPillText(canvas, mid - const Offset(0, 12), conn.name!.trim(),
          const Color(0xFF93C5FD));
    }

    if (conn.type != UmlRelationType.generalization &&
        conn.type != UmlRelationType.realization) {
      _drawPillText(
          canvas, start + dir * 22, conn.sourceMultiplicity, Colors.white70);
      _drawPillText(
          canvas, end - dir * 22, conn.targetMultiplicity, Colors.white70);
    }
  }

  void _drawPillText(Canvas canvas, Offset center, String text, Color color) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: color,
          fontSize: 10.5,
          fontWeight: FontWeight.w600,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();

    final rect = Rect.fromCenter(
      center: center,
      width: tp.width + 10,
      height: tp.height + 4,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, const Radius.circular(6)),
      Paint()..color = const Color(0xFF0F172A).withValues(alpha: 0.88),
    );
    tp.paint(canvas, center - Offset(tp.width / 2, tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant RelationPainter oldDelegate) => true;
}

