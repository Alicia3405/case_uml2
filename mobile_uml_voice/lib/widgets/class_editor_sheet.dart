import 'package:flutter/material.dart';
import '../models/uml_models.dart';
import '../providers/project_provider.dart';

/// Bottom sheet para crear o editar una clase, interfaz, enum o nota UML.
/// Gestiona bloqueo mutuo WebSocket en tiempo real mientras dura la edición.
Future<void> showClassEditorSheet(
  BuildContext context,
  ProjectProvider provider, {
  UmlNode? existing,
  Offset? defaultPosition,
}) async {
  final isNew = existing == null;
  if (!isNew) {
    final lock = provider.getForeignNodeLock(existing.id);
    if (lock != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('🔒 "${existing.name}" está siendo editado por ${lock.userName}'),
          backgroundColor: const Color(0xFFB45309),
        ),
      );
      return;
    }
    if (!provider.isReadOnly) {
      provider.collabService.requestNodeLock(existing.id);
    }
  }

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF1E293B),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _ClassEditorBody(
      provider: provider,
      existing: existing,
      defaultPosition: defaultPosition ?? const Offset(120, 120),
    ),
  );

  if (!isNew && !provider.isReadOnly) {
    provider.collabService.releaseNodeLock(existing.id);
  }
}

class _ClassEditorBody extends StatefulWidget {
  final ProjectProvider provider;
  final UmlNode? existing;
  final Offset defaultPosition;

  const _ClassEditorBody({
    required this.provider,
    this.existing,
    required this.defaultPosition,
  });

  @override
  State<_ClassEditorBody> createState() => _ClassEditorBodyState();
}

class _ClassEditorBodyState extends State<_ClassEditorBody> {
  static const _commonTypes = [
    'UUID',
    'String',
    'Integer',
    'Long',
    'BigDecimal',
    'Double',
    'Boolean',
    'LocalDate',
    'LocalDateTime',
    'EnumConstant',
  ];

  late TextEditingController _nameCtrl;
  late TextEditingController _stereotypeCtrl;
  late TextEditingController _noteCtrl;
  late UmlElementType _elementType;
  late List<UmlAttribute> _attributes;
  late List<UmlMethod> _methods;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    _nameCtrl = TextEditingController(text: e?.name ?? 'NuevaEntidad');
    _stereotypeCtrl = TextEditingController(text: e?.stereotype ?? '');
    _noteCtrl = TextEditingController(text: e?.noteContent ?? '');
    _elementType = e?.elementType ?? UmlElementType.umlClass;
    _attributes = e != null
        ? e.attributes.map((a) => a.copyWith()).toList()
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
              isNullable: false,
              orderIndex: 1,
            ),
          ];
    _methods = e != null ? e.methods.map((m) => m.copyWith()).toList() : [];
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _stereotypeCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  void _save() {
    if (widget.provider.isReadOnly) return;

    final name = _nameCtrl.text.trim();
    if (name.isEmpty && _elementType != UmlElementType.note) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El nombre no puede estar vacío')),
      );
      return;
    }

    final node = UmlNode(
      id: widget.existing?.id ?? ProjectProvider.generateShortId('mob'),
      name: name.isEmpty ? 'Nota' : name,
      elementType: _elementType,
      stereotype: _stereotypeCtrl.text.trim().isEmpty
          ? (_elementType == UmlElementType.umlInterface
              ? '«interface»'
              : _elementType == UmlElementType.umlEnum
                  ? '«enumeration»'
                  : null)
          : _stereotypeCtrl.text.trim(),
      noteContent:
          _elementType == UmlElementType.note ? _noteCtrl.text.trim() : null,
      position: widget.existing?.position ?? widget.defaultPosition,
      width: widget.existing?.width ?? 230,
      attributes: _attributes,
      methods: _methods,
    );

    if (widget.existing == null) {
      widget.provider.addNode(node);
    } else {
      widget.provider.updateNode(node);
    }
    Navigator.of(context).pop();
  }

  Future<void> _addAttributeDialog() async {
    final nameCtrl = TextEditingController();
    var typeVal =
        _elementType == UmlElementType.umlEnum ? 'EnumConstant' : 'String';
    var isPk = false;
    var isNullable = true;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          title: Text(
            _elementType == UmlElementType.umlEnum
                ? 'Agregar Literal Enum'
                : 'Agregar Atributo',
            style: const TextStyle(color: Colors.white, fontSize: 16),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Nombre del campo',
                  labelStyle: TextStyle(color: Colors.white70),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _commonTypes.contains(typeVal) ? typeVal : 'String',
                dropdownColor: const Color(0xFF1E293B),
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Tipo Java / UML',
                  labelStyle: TextStyle(color: Colors.white70),
                ),
                items: _commonTypes
                    .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setDlg(() => typeVal = v);
                },
              ),
              if (_elementType != UmlElementType.umlEnum) ...[
                SwitchListTile(
                  value: isPk,
                  title: const Text('Clave Primaria [PK]',
                      style: TextStyle(color: Colors.white, fontSize: 13)),
                  onChanged: (v) => setDlg(() {
                    isPk = v;
                    if (v) isNullable = false;
                  }),
                ),
                SwitchListTile(
                  value: isNullable,
                  title: const Text('Nullable',
                      style: TextStyle(color: Colors.white, fontSize: 13)),
                  onChanged: isPk ? null : (v) => setDlg(() => isNullable = v),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Agregar'),
            ),
          ],
        ),
      ),
    );

    if (ok == true && nameCtrl.text.trim().isNotEmpty) {
      setState(() {
        _attributes.add(
          UmlAttribute(
            name: nameCtrl.text.trim(),
            type: typeVal,
            visibility: _elementType == UmlElementType.umlEnum
                ? UmlVisibility.public
                : UmlVisibility.private,
            isPrimaryKey: isPk,
            isNullable: isPk ? false : isNullable,
            orderIndex: _attributes.length,
          ),
        );
      });
    }
  }

  Future<void> _addMethodDialog() async {
    final nameCtrl = TextEditingController();
    final paramsCtrl = TextEditingController();
    final returnCtrl = TextEditingController(text: 'void');

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        title: const Text('Agregar Método / Operación',
            style: TextStyle(color: Colors.white, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Nombre (ej: calcularTotal)',
                labelStyle: TextStyle(color: Colors.white70),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: paramsCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Parámetros (ej: monto: BigDecimal)',
                labelStyle: TextStyle(color: Colors.white70),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: returnCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Tipo de retorno',
                labelStyle: TextStyle(color: Colors.white70),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Agregar'),
          ),
        ],
      ),
    );

    if (ok == true && nameCtrl.text.trim().isNotEmpty) {
      setState(() {
        _methods.add(
          UmlMethod(
            name: nameCtrl.text.trim(),
            parameters: paramsCtrl.text.trim(),
            returnType:
                returnCtrl.text.trim().isEmpty ? 'void' : returnCtrl.text.trim(),
            orderIndex: _methods.length,
          ),
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final readOnly = widget.provider.isReadOnly;

    return Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.existing == null
                        ? 'Nuevo Elemento UML'
                        : 'Inspector: ${widget.existing!.name}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (widget.existing != null && !readOnly)
                  IconButton(
                    icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                    tooltip: 'Eliminar del diagrama',
                    onPressed: () {
                      widget.provider.deleteNode(widget.existing!.id);
                      Navigator.pop(context);
                    },
                  ),
              ],
            ),
            if (readOnly)
              Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.amber.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text(
                  'Modo solo lectura (VIEWER): puedes inspeccionar los detalles pero no modificar.',
                  style: TextStyle(color: Color(0xFFFCD34D), fontSize: 12),
                ),
              ),
            const SizedBox(height: 8),
            SegmentedButton<UmlElementType>(
              segments: const [
                ButtonSegment(value: UmlElementType.umlClass, label: Text('Clase')),
                ButtonSegment(
                    value: UmlElementType.umlInterface, label: Text('Interfaz')),
                ButtonSegment(value: UmlElementType.umlEnum, label: Text('Enum')),
                ButtonSegment(value: UmlElementType.note, label: Text('Nota')),
              ],
              selected: {_elementType},
              onSelectionChanged: readOnly
                  ? null
                  : (vals) => setState(() => _elementType = vals.first),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _nameCtrl,
              enabled: !readOnly,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Nombre del Elemento',
                border: OutlineInputBorder(),
              ),
            ),
            if (_elementType == UmlElementType.note) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _noteCtrl,
                enabled: !readOnly,
                maxLines: 4,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Contenido de la Nota',
                  border: OutlineInputBorder(),
                ),
              ),
            ] else ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  Text(
                    _elementType == UmlElementType.umlEnum
                        ? 'Constantes (${_attributes.length})'
                        : 'Atributos (${_attributes.length})',
                    style: const TextStyle(
                        color: Color(0xFF94A3B8), fontWeight: FontWeight.w600),
                  ),
                  const Spacer(),
                  if (!readOnly)
                    TextButton.icon(
                      onPressed: _addAttributeDialog,
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('Agregar'),
                    ),
                ],
              ),
              ..._attributes.asMap().entries.map((entry) {
                final i = entry.key;
                final attr = entry.value;
                return Container(
                  margin: const EdgeInsets.only(bottom: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      if (attr.isPrimaryKey)
                        const Padding(
                          padding: EdgeInsets.only(right: 6),
                          child: Text('PK',
                              style: TextStyle(
                                  color: Color(0xFFFBBF24),
                                  fontWeight: FontWeight.bold,
                                  fontSize: 11)),
                        ),
                      Expanded(
                        child: Text(
                          '${attr.visibility.symbol} ${attr.name}: ${attr.type}',
                          style: const TextStyle(
                              color: Colors.white,
                              fontFamily: 'monospace',
                              fontSize: 12.5),
                        ),
                      ),
                      if (!readOnly)
                        IconButton(
                          icon: const Icon(Icons.close,
                              size: 16, color: Colors.redAccent),
                          onPressed: () =>
                              setState(() => _attributes.removeAt(i)),
                        ),
                    ],
                  ),
                );
              }),
              if (_elementType != UmlElementType.umlEnum) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Text(
                      'Métodos (${_methods.length})',
                      style: const TextStyle(
                          color: Color(0xFF94A3B8),
                          fontWeight: FontWeight.w600),
                    ),
                    const Spacer(),
                    if (!readOnly)
                      TextButton.icon(
                        onPressed: _addMethodDialog,
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Agregar'),
                      ),
                  ],
                ),
                ..._methods.asMap().entries.map((entry) {
                  final i = entry.key;
                  final m = entry.value;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 4),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F172A),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${m.visibility.symbol} ${m.name}(${m.parameters}): ${m.returnType}',
                            style: const TextStyle(
                                color: Color(0xFF93C5FD),
                                fontFamily: 'monospace',
                                fontSize: 12),
                          ),
                        ),
                        if (!readOnly)
                          IconButton(
                            icon: const Icon(Icons.close,
                                size: 16, color: Colors.redAccent),
                            onPressed: () =>
                                setState(() => _methods.removeAt(i)),
                          ),
                      ],
                    ),
                  );
                }),
              ],
            ],
            const SizedBox(height: 16),
            if (!readOnly)
              ElevatedButton.icon(
                onPressed: _save,
                icon: const Icon(Icons.check),
                label: Text(widget.existing == null
                    ? 'Crear en Lienzo'
                    : 'Aplicar Cambios'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF38BDF8),
                  foregroundColor: const Color(0xFF0F172A),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

