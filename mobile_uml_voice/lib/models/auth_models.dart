/// Modelo de usuario autenticado contra `/api/auth`.
class AppUser {
  final String id;
  final String fullName;
  final String email;
  final bool isActive;
  final String color;
  final DateTime? createdAt;

  AppUser({
    required this.id,
    required this.fullName,
    required this.email,
    this.isActive = true,
    String? color,
    this.createdAt,
  }) : color = color ?? generateUserColor('$fullName$id');

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) {
      return email.isNotEmpty ? email[0].toUpperCase() : 'U';
    }
    if (parts.length == 1) {
      return parts.first[0].toUpperCase();
    }
    return '${parts.first[0]}${parts[1][0]}'.toUpperCase();
  }

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final id = (json['id'] ?? '').toString();
    final fullName = (json['fullName'] ?? json['nombreCompleto'] ?? '').toString();
    final email = (json['email'] ?? '').toString();
    return AppUser(
      id: id,
      fullName: fullName.isNotEmpty ? fullName : email,
      email: email,
      isActive: json['isActive'] is bool ? json['isActive'] as bool : true,
      color: json['color']?.toString() ?? generateUserColor('$fullName$id'),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'email': email,
        'isActive': isActive,
        'color': color,
        'createdAt': createdAt?.toIso8601String(),
      };

  static String generateUserColor(String seed) {
    const palette = [
      '#EF4444',
      '#F59E0B',
      '#10B981',
      '#3B82F6',
      '#6366F1',
      '#8B5CF6',
      '#EC4899',
      '#06B6D4',
      '#F97316',
    ];
    if (seed.isEmpty) return '#3B82F6';
    var hash = 0;
    for (var i = 0; i < seed.length; i++) {
      hash = (seed.codeUnitAt(i) + ((hash << 5) - hash)) & 0x7FFFFFFF;
    }
    return palette[hash % palette.length];
  }
}

/// Especificación de usuarios demo sembrados en el backend (`AuthSeedService`).
class DemoAccountSpec {
  final String label;
  final String roleBadge;
  final String fullName;
  final String email;
  final String password;

  const DemoAccountSpec({
    required this.label,
    required this.roleBadge,
    required this.fullName,
    required this.email,
    this.password = 'Pass1234!',
  });

  static const List<DemoAccountSpec> defaults = [
    DemoAccountSpec(
      label: 'Cesar Quispe',
      roleBadge: 'OWNER E-Commerce',
      fullName: 'Cesar Quispe Delgado',
      email: 'cesar@uagrm.edu.bo',
    ),
    DemoAccountSpec(
      label: 'Ana Gómez',
      roleBadge: 'EDITOR+ZIP / Owner Clínica',
      fullName: 'Ana Gómez Rojas',
      email: 'ana@uagrm.edu.bo',
    ),
    DemoAccountSpec(
      label: 'Luis Mendoza',
      roleBadge: 'EDITOR sin ZIP (E-Com)',
      fullName: 'Luis Mendoza Torres',
      email: 'luis@uagrm.edu.bo',
    ),
    DemoAccountSpec(
      label: 'Sofía Vargas',
      roleBadge: 'VIEWER Solo Lectura',
      fullName: 'Sofía Vargas Paredes',
      email: 'sofia@uagrm.edu.bo',
    ),
  ];
}

/// Miembro colaborador asociado a un proyecto (`ProjectMemberResponseDto`).
class ProjectMember {
  final String id;
  final String userId;
  final String fullName;
  final String email;
  String role; // OWNER | EDITOR | VIEWER
  bool canDownloadCode;
  final DateTime? joinedAt;

  ProjectMember({
    this.id = '',
    required this.userId,
    required this.fullName,
    required this.email,
    this.role = 'EDITOR',
    this.canDownloadCode = true,
    this.joinedAt,
  });

  String get color => AppUser.generateUserColor('$fullName$userId');

  factory ProjectMember.fromJson(Map<String, dynamic> json) {
    final role = (json['role'] ?? 'EDITOR').toString().toUpperCase();
    return ProjectMember(
      id: (json['id'] ?? '').toString(),
      userId: (json['userId'] ?? '').toString(),
      fullName: (json['fullName'] ?? json['email'] ?? 'Colaborador').toString(),
      email: (json['email'] ?? '').toString(),
      role: role,
      canDownloadCode: json['canDownloadCode'] is bool
          ? json['canDownloadCode'] as bool
          : role != 'VIEWER',
      joinedAt: json['joinedAt'] != null
          ? DateTime.tryParse(json['joinedAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'userId': userId,
        'fullName': fullName,
        'email': email,
        'role': role,
        'canDownloadCode': canDownloadCode,
        'joinedAt': joinedAt?.toIso8601String(),
      };
}

