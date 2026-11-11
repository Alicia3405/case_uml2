import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/project_provider.dart';
import 'screens/canvas_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';
import 'screens/voice_assistant_screen.dart';
import 'services/ai_api_service.dart';
import 'services/auth_service.dart';
import 'services/codegen_api_service.dart';
import 'services/collaboration_socket_service.dart';
import 'services/project_storage_service.dart';
import 'services/xmi_api_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final authService = AuthService()..init();
  final storageService = ProjectStorageService(authService.apiClient);
  final collabService = CollaborationSocketService();
  final aiService = AiApiService(authService.apiClient);
  final codegenService = CodegenApiService(authService.apiClient);
  final xmiService = XmiApiService(authService.apiClient);

  final projectProvider = ProjectProvider(
    authService: authService,
    storageService: storageService,
    collabService: collabService,
    aiService: aiService,
    codegenService: codegenService,
    xmiService: xmiService,
  );

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthService>.value(value: authService),
        ChangeNotifierProvider<CollaborationSocketService>.value(
            value: collabService),
        ChangeNotifierProvider<ProjectProvider>.value(value: projectProvider),
      ],
      child: const CaseStudioMobileApp(),
    ),
  );
}

class CaseStudioMobileApp extends StatelessWidget {
  const CaseStudioMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CASE Studio AI Mobile',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorSchemeSeed: const Color(0xFF38BDF8),
        scaffoldBackgroundColor: const Color(0xFF090D16),
      ),
      home: const _AuthGate(),
    );
  }
}

class _AuthGate extends StatelessWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();

    if (!auth.isInitialized) {
      return const Scaffold(
        backgroundColor: Color(0xFF090D16),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(color: Color(0xFF38BDF8)),
              SizedBox(height: 12),
              Text(
                'Iniciando CASE Studio AI...',
                style: TextStyle(color: Colors.white70),
              ),
            ],
          ),
        ),
      );
    }

    if (!auth.isAuthenticated) {
      return const LoginScreen();
    }

    return const MainNavigationScreen();
  }
}

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _tabIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _tabIndex,
        children: [
          DashboardScreen(
            onNavigateToCanvas: () => setState(() => _tabIndex = 2),
            onNavigateToVoice: () => setState(() => _tabIndex = 1),
          ),
          VoiceAssistantScreen(
            onNavigateToCanvas: () => setState(() => _tabIndex = 2),
          ),
          const CanvasScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF0F172A),
        indicatorColor: const Color(0xFF38BDF8).withValues(alpha: 0.22),
        selectedIndex: _tabIndex,
        onDestinationSelected: (idx) => setState(() => _tabIndex = idx),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.folder_outlined),
            selectedIcon: Icon(Icons.folder, color: Color(0xFF38BDF8)),
            label: 'Proyectos',
          ),
          NavigationDestination(
            icon: Icon(Icons.mic_none_rounded),
            selectedIcon: Icon(Icons.mic_rounded, color: Color(0xFF38BDF8)),
            label: 'Asistente Voz',
          ),
          NavigationDestination(
            icon: Icon(Icons.schema_outlined),
            selectedIcon: Icon(Icons.schema, color: Color(0xFF38BDF8)),
            label: 'Lienzo UML',
          ),
        ],
      ),
    );
  }
}
