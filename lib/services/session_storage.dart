import 'package:shared_preferences/shared_preferences.dart';

enum PersistedSessionType { admin, owner }

class PersistedSession {
  const PersistedSession._({
    required this.type,
    this.ownerId,
    this.adminEmail,
    this.adminPassword,
  });

  final PersistedSessionType type;
  final String? ownerId;
  final String? adminEmail;
  final String? adminPassword;

  bool get isAdmin => type == PersistedSessionType.admin;
  bool get isOwner => type == PersistedSessionType.owner;

  static const String _typeKey = 'persisted_session_type';
  static const String _ownerIdKey = 'persisted_session_owner_id';
  static const String _adminEmailKey = 'persisted_session_admin_email';
  static const String _adminPasswordKey = 'persisted_session_admin_password';

  static Future<PersistedSession?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final rawType = prefs.getString(_typeKey)?.trim();
    if (rawType == 'owner') {
      final ownerId = prefs.getString(_ownerIdKey)?.trim() ?? '';
      if (ownerId.isEmpty) return null;
      return PersistedSession._(
        type: PersistedSessionType.owner,
        ownerId: ownerId,
      );
    }
    if (rawType == 'admin') {
      final email = prefs.getString(_adminEmailKey)?.trim() ?? '';
      final password = prefs.getString(_adminPasswordKey) ?? '';
      if (email.isEmpty || password.isEmpty) return null;
      return PersistedSession._(
        type: PersistedSessionType.admin,
        adminEmail: email,
        adminPassword: password,
      );
    }
    return null;
  }

  static Future<void> saveOwner(String ownerId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_typeKey, 'owner');
    await prefs.setString(_ownerIdKey, ownerId.trim());
    await prefs.remove(_adminEmailKey);
    await prefs.remove(_adminPasswordKey);
  }

  static Future<void> saveAdmin({
    required String email,
    required String password,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_typeKey, 'admin');
    await prefs.setString(_adminEmailKey, email.trim());
    await prefs.setString(_adminPasswordKey, password);
    await prefs.remove(_ownerIdKey);
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_typeKey);
    await prefs.remove(_ownerIdKey);
    await prefs.remove(_adminEmailKey);
    await prefs.remove(_adminPasswordKey);
  }
}
