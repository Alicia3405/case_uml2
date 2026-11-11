import 'package:flutter/material.dart';
import '../models/uml_models.dart';
import '../providers/project_provider.dart';

/// Diálogo para crear o administrar relaciones UML entre elementos del lienzo.
Future<void> showRelationEditorDialog(
  BuildContext context,
  ProjectProvider provider,
) async {
  final diagram = provider.activeDiagram;
  if (diagram == null) return;
  final nodes = diagram.visibleNodes;
  if (nodes.length < 2) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Necesitas al menos 2 clases en el lienzo para crear relaciones.'),
      ),
    );
    return;
  }

  var srcId = nodes.first.id;
  var tgtId = nodes[1].id;
  var relType = UmlRelationType.association;
  final labelCtrl = TextEditingController();
  var srcMult = '1';
  var tgtMult = '0..*';

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setDlg) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Conectar Elementos UML',
            style: TextStyle(color: Colors.white, fontSize: 17)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: srcId,
                dropdownColor: const Color(0xFF0F172A),
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Origen',
                  labelStyle: TextStyle(color: Colors.white70),
                ),
                items: nodes
                    .map((n) => DropdownMenuItem(value: n.id, child: Text(n.name)))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setDlg(() => srcId = v);
                },
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: tgtId,
                dropdownColor: const Color(0xFF0F172A),
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Destino',
                  labelStyle: TextStyle(color: Colors.white70),
                ),
                items: nodes
                    .map((n) => DropdownMenuItem(value: n.id, child: Text(n.name)))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setDlg(() => tgtId = v);
                },
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<UmlRelationType>(
                initialValue: relType,
                dropdownColor: const Color(0xFF0F172A),
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Tipo de Relación UML',
                  labelStyle: TextStyle(color: Colors.white70),
                ),
                items: UmlRelationType.values
                    .map((t) => DropdownMenuItem(value: t, child: Text(t.label)))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setDlg(() => relType = v);
                },
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: srcMult,
                      dropdownColor: const Color(0xFF0F172A),
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Mult. Origen',
                        labelStyle: TextStyle(color: Colors.white70),
                      ),
                      items: const ['1', '0..1', '0..*', '1..*']
                          .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                          .toList(),
                      onChanged: (v) {
                        if (v != null) setDlg(() => srcMult = v);
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: tgtMult,
                      dropdownColor: const Color(0xFF0F172A),
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Mult. Destino',
                        labelStyle: TextStyle(color: Colors.white70),
                      ),
                      items: const ['1', '0..1', '0..*', '1..*']
                          .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                          .toList(),
                      onChanged: (v) {
                        if (v != null) setDlg(() => tgtMult = v);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: labelCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Etiqueta / Verbo (opcional, ej: contiene)',
                  labelStyle: TextStyle(color: Colors.white70),
                ),
              ),
              if (diagram.connections.isNotEmpty) ...[
                const SizedBox(height: 14),
                const Text(
                  'Relaciones actuales:',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
                const SizedBox(height: 4),
                ...diagram.connections.map((c) {
                  final sName =
                      nodes.where((n) => n.id == c.sourceNodeId).firstOrNull?.name ??
                          '?';
                  final tName =
                      nodes.where((n) => n.id == c.targetNodeId).firstOrNull?.name ??
                          '?';
                  return Row(
                    children: [
                      Expanded(
                        child: Text(
                          '$sName → $tName (${c.type.label})',
                          style: const TextStyle(
                              color: Colors.white60, fontSize: 11.5),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (!provider.isReadOnly)
                        IconButton(
                          icon: const Icon(Icons.delete_outline,
                              size: 16, color: Colors.redAccent),
                          onPressed: () {
                            provider.deleteConnection(c.id);
                            setDlg(() {});
                          },
                        ),
                    ],
                  );
                }),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cerrar'),
          ),
          if (!provider.isReadOnly)
            ElevatedButton(
              onPressed: () {
                provider.addConnection(
                  UmlConnection(
                    id: ProjectProvider.generateShortId('conn'),
                    sourceNodeId: srcId,
                    targetNodeId: tgtId,
                    type: relType,
                    name: labelCtrl.text.trim().isEmpty
                        ? null
                        : labelCtrl.text.trim(),
                    sourceMultiplicity: srcMult,
                    targetMultiplicity: tgtMult,
                  ),
                );
                Navigator.pop(ctx);
              },
              child: const Text('Conectar'),
            ),
        ],
      ),
    ),
  );
}

