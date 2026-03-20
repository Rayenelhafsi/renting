import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import 'api_http_client.dart';

class DwiraApiService {
  DwiraApiService._();

  static final DwiraApiService instance = DwiraApiService._();

  final http.Client _client = createApiHttpClient();
  String? _sessionCookie;
  bool _adminAuthenticated = false;

  bool get isAdminAuthenticated => _adminAuthenticated;

  String get _baseUrl =>
      AppConfig.dwiraApiBaseUrl.replaceAll(RegExp(r'/+$'), '');

  Uri _uri(String path, [Map<String, String>? query]) {
    final cleanPath = path.startsWith('/') ? path : '/$path';
    final uri = Uri.parse('$_baseUrl$cleanPath');
    if (query == null || query.isEmpty) return uri;
    return uri.replace(queryParameters: query);
  }

  Future<void> loginAdmin(
      {required String email, required String password}) async {
    final response = await _request(
      'POST',
      '/api/auth/admin/login',
      body: {
        'email': email.trim(),
        'password': password,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_errorMessage(response, 'Echec connexion admin API'));
    }

    _adminAuthenticated = true;
  }

  Future<void> logoutAdmin() async {
    try {
      await _request('POST', '/api/auth/logout');
    } finally {
      _adminAuthenticated = false;
      _sessionCookie = null;
    }
  }

  Future<List<Map<String, dynamic>>> fetchBiens({String? ownerId}) async {
    final response = await _request('GET', '/api/biens');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Chargement des biens impossible'));
    }

    final decoded = _decodeJson(response);
    if (decoded is! List) return const <Map<String, dynamic>>[];
    final rows = decoded
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    if (ownerId == null || ownerId.trim().isEmpty) {
      return rows;
    }
    final targetOwner = ownerId.trim();
    return rows
        .where((row) =>
            (row['proprietaire_id'] ?? '').toString().trim() == targetOwner)
        .toList();
  }

  Future<Map<String, dynamic>> fetchBienById(String bienId) async {
    final normalizedId = bienId.trim();
    if (normalizedId.isEmpty) {
      throw Exception('ID bien manquant');
    }
    final response = await _request(
      'GET',
      '/api/biens/${Uri.encodeComponent(normalizedId)}',
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Chargement detail bien impossible'));
    }
    final decoded = _decodeJson(response);
    if (decoded is! Map) return <String, dynamic>{};
    return Map<String, dynamic>.from(decoded);
  }

  Future<List<Map<String, dynamic>>> fetchBienMedia(String bienId) async {
    final normalizedId = bienId.trim();
    if (normalizedId.isEmpty) return const <Map<String, dynamic>>[];
    final response = await _request(
      'GET',
      '/api/media/${Uri.encodeComponent(normalizedId)}',
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_errorMessage(response, 'Chargement media impossible'));
    }
    final decoded = _decodeJson(response);
    if (decoded is! List) return const <Map<String, dynamic>>[];
    return decoded
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<List<Map<String, dynamic>>> fetchProprietairesAdmin() async {
    final response = await _request(
      'GET',
      '/api/proprietaires',
      requiresAdmin: true,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Chargement proprietaires impossible'));
    }

    final decoded = _decodeJson(response);
    if (decoded is! List) return const <Map<String, dynamic>>[];
    return decoded
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<Map<String, dynamic>> createProprietaireAdmin({
    required String nom,
    required String telephone,
    required String email,
    required String cin,
    String? id,
  }) async {
    final response = await _request(
      'POST',
      '/api/proprietaires',
      requiresAdmin: true,
      body: {
        if (id != null && id.trim().isNotEmpty) 'id': id.trim(),
        'nom': nom.trim(),
        'telephone': telephone.trim(),
        'email': email.trim().toLowerCase(),
        'cin': cin.trim(),
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Creation proprietaire impossible'));
    }

    final decoded = _decodeJson(response);
    if (decoded is! Map) return <String, dynamic>{};
    return Map<String, dynamic>.from(decoded);
  }

  Future<Map<String, dynamic>> createBienAdmin({
    required String titre,
    required String proprietaireId,
  }) async {
    final response = await _request(
      'POST',
      '/api/biens',
      requiresAdmin: true,
      body: {
        'reference': 'MOBILE-${DateTime.now().millisecondsSinceEpoch}',
        'titre': titre.trim(),
        'description': 'Ajoute depuis application proprietaires',
        'type': 'S2',
        'type_bien': 's+2',
        'mode': 'location-saisonniere',
        'mode_bien': 'location-saisonniere',
        'nb_chambres': 2,
        'nb_salle_bain': 1,
        'prix_nuitee': 0,
        'avance': 0,
        'caution': 0,
        'statut': 'disponible',
        'visible_sur_site': 1,
        'is_featured': 0,
        'menage_en_cours': 0,
        'proprietaire_id': proprietaireId.trim(),
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_errorMessage(response, 'Creation bien impossible'));
    }
    final decoded = _decodeJson(response);
    if (decoded is! Map) return <String, dynamic>{};
    return Map<String, dynamic>.from(decoded);
  }

  Future<List<Map<String, dynamic>>> fetchUnavailableDates(
      String bienId) async {
    final response = await _request(
        'GET', '/api/unavailable-dates/${Uri.encodeComponent(bienId)}');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Chargement calendrier impossible'));
    }
    final decoded = _decodeJson(response);
    if (decoded is! List) return const <Map<String, dynamic>>[];
    return decoded
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<void> createUnavailableDateAdmin({
    required String bienId,
    required String startDate,
    required String endDate,
    required String status,
    String? color,
  }) async {
    final response = await _request(
      'POST',
      '/api/unavailable-dates',
      requiresAdmin: true,
      body: {
        'bien_id': bienId,
        'start_date': startDate,
        'end_date': endDate,
        'status': status,
        if (color != null && color.trim().isNotEmpty) 'color': color,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Mise a jour calendrier impossible'));
    }
  }

  Future<void> submitCalendarUpdateRequest({
    required String ownerId,
    required String bienId,
    required String propertyTitle,
    required String startDate,
    required String endDate,
    required String requestType,
    String? note,
  }) async {
    final normalizedRequestType =
        requestType.trim().toLowerCase() == 'open' ? 'open' : 'close';
    final response = await _request(
      'POST',
      '/api/client-interactions',
      body: {
        'clientUserId': ownerId,
        'clientEmail': '$ownerId@owner.local',
        'clientName': ownerId,
        'type': 'reservation_attempt',
        'bienId': bienId,
        'propertyTitle': propertyTitle,
        'path': '/mobile/owner/calendar-request',
        'metadata': {
          'kind': 'calendar_update_request',
          'ownerId': ownerId,
          'bienId': bienId,
          'propertyTitle': propertyTitle,
          'startDate': startDate,
          'endDate': endDate,
          'requestType': normalizedRequestType,
          'note': (note ?? '').trim(),
          'status': 'pending',
          'submittedAt': DateTime.now().toIso8601String(),
        },
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Envoi demande calendrier impossible'));
    }
  }

  Future<List<Map<String, dynamic>>> fetchCalendarUpdateRequestsAdmin({
    Set<String>? statuses,
  }) async {
    final allowedStatuses = statuses
        ?.map((s) => s.trim().toLowerCase())
        .where((s) => s.isNotEmpty)
        .toSet();
    final all = await fetchClientInteractionsAdmin();
    final rows = all
        .where((item) {
          final metadata = item['metadata'];
          if (metadata is! Map) return false;
          if ((metadata['kind'] ?? '').toString() !=
              'calendar_update_request') {
            return false;
          }
          return true;
        })
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    final hasFinalByKey = <String, bool>{};
    for (final row in rows) {
      final key = _calendarRequestKey(row);
      if (key.isEmpty) continue;
      final status = _calendarRequestStatus(row);
      if (status == 'approved' || status == 'rejected') {
        hasFinalByKey[key] = true;
      }
    }

    var filtered = rows.where((row) {
      final status = _calendarRequestStatus(row);
      final key = _calendarRequestKey(row);
      if (status == 'pending' && (hasFinalByKey[key] ?? false)) {
        return false;
      }
      if (allowedStatuses == null || allowedStatuses.isEmpty) return true;
      return allowedStatuses.contains(status);
    }).toList();

    if (allowedStatuses != null &&
        allowedStatuses.length == 1 &&
        allowedStatuses.contains('pending')) {
      final seen = <String>{};
      filtered = filtered.where((row) {
        final key = _calendarRequestKey(row);
        if (key.isEmpty) return true;
        if (seen.contains(key)) return false;
        seen.add(key);
        return true;
      }).toList();
    } else if (allowedStatuses != null &&
        allowedStatuses.every((s) => s == 'approved' || s == 'rejected')) {
      final bestByKey = <String, Map<String, dynamic>>{};
      for (final row in filtered) {
        final key = _calendarRequestKey(row);
        if (key.isEmpty) continue;
        final current = bestByKey[key];
        if (current == null ||
            _calendarRequestSortValue(row)
                    .compareTo(_calendarRequestSortValue(current)) >
                0) {
          bestByKey[key] = row;
        }
      }
      filtered = bestByKey.values.toList();
    }

    filtered.sort((a, b) => (b['dateTime'] ?? '')
        .toString()
        .compareTo((a['dateTime'] ?? '').toString()));
    return filtered;
  }

  Future<List<Map<String, dynamic>>> fetchCalendarUpdateHistoryAdmin() {
    return fetchCalendarUpdateRequestsAdmin(
      statuses: {'approved', 'rejected'},
    );
  }

  Future<List<Map<String, dynamic>>> fetchChatMessagesAdmin() async {
    final all = await fetchClientInteractionsAdmin();
    return all.where((item) {
      final metadata = item['metadata'];
      if (metadata is! Map) return false;
      final kind = (metadata['kind'] ?? '').toString();
      return kind == 'owner_admin_chat' || kind == 'admin_owner_chat';
    }).toList();
  }

  Future<List<Map<String, dynamic>>> fetchOwnerChatMessages(
    String ownerId, {
    String? bienId,
  }) async {
    final normalizedOwnerId = ownerId.trim();
    if (normalizedOwnerId.isEmpty) return const <Map<String, dynamic>>[];
    final normalizedBienId = (bienId ?? '').trim();
    final response = await _request(
      'GET',
      '/api/mobile/owners/${Uri.encodeComponent(normalizedOwnerId)}/chat',
      query: {
        if (normalizedBienId.isNotEmpty) 'bien_id': normalizedBienId,
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Chargement chat proprietaire impossible'));
    }
    final decoded = _decodeJson(response);
    if (decoded is! List) return const <Map<String, dynamic>>[];
    return decoded
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<void> sendOwnerChatMessage({
    required String ownerId,
    required String text,
    String? bienId,
    String? propertyTitle,
  }) async {
    final normalizedOwnerId = ownerId.trim();
    final normalizedText = text.trim();
    final normalizedBienId = (bienId ?? '').trim();
    final normalizedPropertyTitle = (propertyTitle ?? '').trim();
    if (normalizedOwnerId.isEmpty || normalizedText.isEmpty) return;

    final response = await _request(
      'POST',
      '/api/mobile/owners/${Uri.encodeComponent(normalizedOwnerId)}/chat',
      body: {
        'text': normalizedText,
        if (normalizedBienId.isNotEmpty) 'bienId': normalizedBienId,
        if (normalizedPropertyTitle.isNotEmpty)
          'propertyTitle': normalizedPropertyTitle,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_errorMessage(response, 'Envoi message impossible'));
    }
  }

  Future<void> sendAdminChatMessage({
    required String ownerId,
    required String text,
    String? bienId,
    String? propertyTitle,
  }) async {
    final normalizedOwnerId = ownerId.trim();
    final normalizedText = text.trim();
    final normalizedBienId = (bienId ?? '').trim();
    final normalizedPropertyTitle = (propertyTitle ?? '').trim();
    if (normalizedOwnerId.isEmpty || normalizedText.isEmpty) return;

    final response = await _request(
      'POST',
      '/api/mobile/admin/owners/${Uri.encodeComponent(normalizedOwnerId)}/chat',
      requiresAdmin: true,
      body: {
        'text': normalizedText,
        if (normalizedBienId.isNotEmpty) 'bienId': normalizedBienId,
        if (normalizedPropertyTitle.isNotEmpty)
          'propertyTitle': normalizedPropertyTitle,
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Envoi message admin impossible'));
    }
  }

  Future<List<Map<String, dynamic>>> fetchNotificationsAdmin() async {
    final response = await _request(
      'GET',
      '/api/notifications',
      requiresAdmin: true,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Chargement notifications impossible'));
    }
    final decoded = _decodeJson(response);
    if (decoded is! List) return const <Map<String, dynamic>>[];
    return decoded
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<List<Map<String, dynamic>>>
      fetchCommunicationNotificationsAdmin() async {
    final interactions = await fetchClientInteractionsAdmin();
    final comms = interactions.where((item) {
      final type = (item['type'] ?? '').toString().toLowerCase();
      final metadata = item['metadata'];
      final kind = metadata is Map ? (metadata['kind'] ?? '').toString() : '';
      return type == 'reservation_attempt' ||
          type == 'reservation_submitted' ||
          kind == 'owner_admin_chat' ||
          kind == 'admin_owner_chat';
    }).map((item) {
      final metadata = (item['metadata'] is Map)
          ? Map<String, dynamic>.from(item['metadata'] as Map)
          : <String, dynamic>{};
      final kind = (metadata['kind'] ?? '').toString();
      final ownerId = (metadata['ownerId'] ?? '').toString();
      final bienId = (metadata['bienId'] ?? item['bienId'] ?? '').toString();
      final propertyTitle =
          (metadata['propertyTitle'] ?? item['propertyTitle'] ?? '').toString();
      final type = (item['type'] ?? '').toString().toLowerCase();
      final category = kind == 'owner_admin_chat' ||
              kind == 'admin_owner_chat' ||
              kind == 'calendar_update_request'
          ? 'owner'
          : (type == 'reservation_attempt' || type == 'reservation_submitted')
              ? 'client'
              : 'owner';
      final text = (metadata['text'] ?? '').toString().trim();
      final message = kind == 'owner_admin_chat'
          ? (text.isNotEmpty
              ? 'Message proprietaire: $text'
              : 'Message proprietaire ($ownerId)${bienId.isNotEmpty ? ' - bien $bienId' : ''}')
          : kind == 'admin_owner_chat'
              ? (text.isNotEmpty
                  ? 'Message admin: $text'
                  : 'Message admin vers proprietaire ($ownerId)${bienId.isNotEmpty ? ' - bien $bienId' : ''}')
              : kind == 'calendar_update_request'
                  ? 'Demande calendrier proprietaire${propertyTitle.isNotEmpty ? ' - $propertyTitle' : ''}'
                  : 'Demande reservation client${propertyTitle.isNotEmpty ? ' - $propertyTitle' : ''}';
      return <String, dynamic>{
        'id': 'ci_${item['id']}',
        'type': 'communication',
        'message': message,
        'created_at': item['dateTime'],
        'source': 'client_interactions',
        'category': category,
        'kind': kind,
        'ownerId': ownerId,
        'bienId': bienId,
        'propertyTitle': propertyTitle,
      };
    }).toList();

    comms.sort((a, b) => (b['created_at'] ?? '')
        .toString()
        .compareTo((a['created_at'] ?? '').toString()));
    return comms;
  }

  Future<List<Map<String, dynamic>>> fetchOwnerNotifications(
    String ownerId,
  ) async {
    final normalizedOwnerId = ownerId.trim();
    if (normalizedOwnerId.isEmpty) return const <Map<String, dynamic>>[];
    final response = await _request(
      'GET',
      '/api/mobile/owners/${Uri.encodeComponent(normalizedOwnerId)}/notifications',
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_errorMessage(
          response, 'Chargement notifications proprietaire impossible'));
    }
    final decoded = _decodeJson(response);
    if (decoded is! List) return const <Map<String, dynamic>>[];
    return decoded
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<void> markOwnerNotificationRead({
    required String ownerId,
    required String notificationId,
  }) async {
    final normalizedOwnerId = ownerId.trim();
    final normalizedNotificationId = notificationId.trim();
    if (normalizedOwnerId.isEmpty || normalizedNotificationId.isEmpty) return;
    final response = await _request(
      'PUT',
      '/api/mobile/owners/${Uri.encodeComponent(normalizedOwnerId)}/notifications/${Uri.encodeComponent(normalizedNotificationId)}/read',
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Mise a jour notification impossible'));
    }
  }

  Future<void> registerOwnerPushToken({
    required String ownerId,
    required String token,
    String? platform,
    String? appVersion,
  }) async {
    final normalizedOwnerId = ownerId.trim();
    final normalizedToken = token.trim();
    if (normalizedOwnerId.isEmpty || normalizedToken.isEmpty) return;
    final response = await _request(
      'POST',
      '/api/mobile/owners/${Uri.encodeComponent(normalizedOwnerId)}/push-token',
      body: {
        'token': normalizedToken,
        if ((platform ?? '').trim().isNotEmpty) 'platform': platform!.trim(),
        if ((appVersion ?? '').trim().isNotEmpty)
          'appVersion': appVersion!.trim(),
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_errorMessage(
          response, 'Enregistrement token notification impossible'));
    }
  }

  Future<List<Map<String, dynamic>>> fetchOwnerAvailabilityRequests(
    String ownerId,
  ) async {
    final normalizedOwnerId = ownerId.trim();
    if (normalizedOwnerId.isEmpty) return const <Map<String, dynamic>>[];
    final response = await _request(
      'GET',
      '/api/mobile/owners/${Uri.encodeComponent(normalizedOwnerId)}/availability-requests',
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_errorMessage(
          response, 'Chargement demandes disponibilite impossible'));
    }
    final decoded = _decodeJson(response);
    if (decoded is! List) return const <Map<String, dynamic>>[];
    return decoded
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<void> respondOwnerAvailabilityRequest({
    required String ownerId,
    required String demandId,
    required bool available,
    String? note,
  }) async {
    final normalizedOwnerId = ownerId.trim();
    final normalizedDemandId = demandId.trim();
    if (normalizedOwnerId.isEmpty || normalizedDemandId.isEmpty) return;
    final response = await _request(
      'POST',
      '/api/mobile/owners/${Uri.encodeComponent(normalizedOwnerId)}/availability-requests/${Uri.encodeComponent(normalizedDemandId)}/respond',
      body: {
        'available': available,
        if ((note ?? '').trim().isNotEmpty) 'note': note!.trim(),
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Reponse disponibilite impossible'));
    }
  }

  Future<void> approveCalendarRequestAdmin(String interactionId) async {
    final response = await _request(
      'POST',
      '/api/mobile/admin/calendar-requests/${Uri.encodeComponent(interactionId.trim())}/approve',
      requiresAdmin: true,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Approbation calendrier impossible'));
    }
  }

  Future<void> rejectCalendarRequestAdmin(
    String interactionId, {
    String? reason,
  }) async {
    final response = await _request(
      'POST',
      '/api/mobile/admin/calendar-requests/${Uri.encodeComponent(interactionId.trim())}/reject',
      requiresAdmin: true,
      body: {
        if ((reason ?? '').trim().isNotEmpty) 'reason': reason!.trim(),
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_errorMessage(response, 'Rejet calendrier impossible'));
    }
  }

  Future<void> createNotificationAdmin({
    required String type,
    required String message,
  }) async {
    final response = await _request(
      'POST',
      '/api/notifications',
      requiresAdmin: true,
      body: {
        'type': type,
        'message': message,
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Creation notification impossible'));
    }
  }

  Future<List<Map<String, dynamic>>> fetchClientInteractionsAdmin() async {
    final response = await _request(
      'GET',
      '/api/client-interactions',
      requiresAdmin: true,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
          _errorMessage(response, 'Chargement interactions impossible'));
    }

    final decoded = _decodeJson(response);
    if (decoded is! List) return const <Map<String, dynamic>>[];
    return decoded
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<http.Response> _request(
    String method,
    String path, {
    bool requiresAdmin = false,
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    final request = http.Request(method.toUpperCase(), _uri(path, query));
    request.headers['Accept'] = 'application/json';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    if (!kIsWeb && _sessionCookie != null && _sessionCookie!.isNotEmpty) {
      request.headers['Cookie'] = _sessionCookie!;
    }

    final streamed = await _client.send(request);
    final response = await http.Response.fromStream(streamed);
    _captureSessionCookie(response);

    if (requiresAdmin &&
        (response.statusCode == 401 || response.statusCode == 403)) {
      _adminAuthenticated = false;
      throw Exception('Session admin expirée. Reconnectez-vous.');
    }

    return response;
  }

  void _captureSessionCookie(http.Response response) {
    final raw = response.headers['set-cookie'];
    if (raw == null || raw.isEmpty) return;
    final first = raw.split(',').first;
    final cookiePair = first.split(';').first.trim();
    if (cookiePair.isNotEmpty) {
      _sessionCookie = cookiePair;
    }
  }

  dynamic _decodeJson(http.Response response) {
    if (response.body.isEmpty) return null;
    try {
      return jsonDecode(response.body);
    } catch (_) {
      return null;
    }
  }

  String _errorMessage(http.Response response, String fallback) {
    final decoded = _decodeJson(response);
    if (decoded is Map && decoded['error'] != null) {
      return decoded['error'].toString();
    }
    return '$fallback (HTTP ${response.statusCode})';
  }

  String _calendarRequestStatus(Map<String, dynamic> row) {
    final metadata = row['metadata'];
    if (metadata is Map) {
      final status =
          (metadata['status'] ?? 'pending').toString().trim().toLowerCase();
      if (status.isNotEmpty) return status;
    }
    return 'pending';
  }

  String _calendarRequestKey(Map<String, dynamic> row) {
    final metadata = row['metadata'];
    if (metadata is! Map) return '';
    final ownerId =
        (metadata['ownerId'] ?? row['clientUserId'] ?? '').toString().trim();
    final bienId =
        (metadata['bienId'] ?? row['bienId'] ?? '').toString().trim();
    final startDate = (metadata['startDate'] ?? '').toString().trim();
    final endDate = (metadata['endDate'] ?? '').toString().trim();
    final requestType =
        (metadata['requestType'] ?? 'close').toString().trim().toLowerCase();
    if (ownerId.isEmpty ||
        bienId.isEmpty ||
        startDate.isEmpty ||
        endDate.isEmpty) {
      return '';
    }
    return '$ownerId|$bienId|$startDate|$endDate|$requestType';
  }

  String _calendarRequestSortValue(Map<String, dynamic> row) {
    final metadata = row['metadata'];
    if (metadata is Map) {
      final reviewedAt = (metadata['reviewedAt'] ?? '').toString().trim();
      if (reviewedAt.isNotEmpty) return reviewedAt;
    }
    return (row['dateTime'] ?? '').toString();
  }
}
