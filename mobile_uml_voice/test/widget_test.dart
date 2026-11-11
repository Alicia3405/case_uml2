import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobile_uml_voice/models/auth_models.dart';
import 'package:mobile_uml_voice/models/uml_models.dart';
import 'package:mobile_uml_voice/screens/login_screen.dart';
import 'package:mobile_uml_voice/services/auth_service.dart';
import 'package:mobile_uml_voice/widgets/uml_node_box.dart';

void main() {
  testWidgets('LoginScreen muestra accesos rápidos para los 4 roles demo',
      (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    final auth = AuthService();

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthService>.value(
        value: auth,
        child: const MaterialApp(
          home: LoginScreen(),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('CASE Studio AI'), findsOneWidget);
    expect(find.text('Cesar Quispe'), findsOneWidget);
    expect(find.text('Ana Gómez'), findsOneWidget);
    expect(find.text('Luis Mendoza'), findsOneWidget);
    expect(find.text('Sofía Vargas'), findsOneWidget);
    expect(DemoAccountSpec.defaults.length, 4);
  });

  testWidgets('UmlNodeBox renderiza PK badge y badge de bloqueo mutuo WebSocket',
      (WidgetTester tester) async {
    final node = UmlNode(
      id: 'seed_ecom_node_pedido',
      name: 'Pedido',
      elementType: UmlElementType.umlClass,
      attributes: [
        UmlAttribute(name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false),
        UmlAttribute(name: 'total', type: 'BigDecimal'),
      ],
      methods: [
        UmlMethod(name: 'calcularTotal', returnType: 'BigDecimal'),
      ],
    );

    final lock = CollabNodeLock(
      nodeId: node.id,
      userId: 'user-ana',
      userName: 'Ana Gómez Rojas',
      color: '#10B981',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UmlNodeBox(
            node: node,
            isSelected: true,
            lockedByOther: lock,
          ),
        ),
      ),
    );

    expect(find.text('Pedido'), findsOneWidget);
    expect(find.text('PK'), findsOneWidget);
    expect(find.text('Editando: Ana Gómez Rojas'), findsOneWidget);
    expect(find.text('+ calcularTotal(): BigDecimal'), findsOneWidget);
  });

  testWidgets('UmlNodeBox renderiza autoría y badge interactivo de anotaciones IA',
      (WidgetTester tester) async {
    var tappedNotes = false;
    final node = UmlNode(
      id: 'n_pago',
      name: 'Pago',
      elementType: UmlElementType.umlClass,
      lastModifiedByName: 'Ana Gómez',
      attributes: [
        UmlAttribute(name: 'id', type: 'UUID', isPrimaryKey: true),
      ],
    );

    final notes = [
      AiAnnotationItem(
        id: 'a1',
        targetNodeId: 'n_pago',
        title: 'Agregar método pagar',
        message: 'Conviene definir el método procesarPago',
      ),
      AiAnnotationItem(
        id: 'a2',
        targetClassName: 'Pago',
        title: 'Asociar Moneda',
        message: 'Usa BigDecimal + código ISO',
      ),
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UmlNodeBox(
            node: node,
            openAnnotations: notes,
            onAnnotationsTap: () => tappedNotes = true,
          ),
        ),
      ),
    );

    expect(find.text('Por: Ana Gómez'), findsOneWidget);
    expect(find.text('💡 2'), findsOneWidget);

    await tester.tap(find.text('💡 2'));
    await tester.pump();
    expect(tappedNotes, isTrue);
  });
}
