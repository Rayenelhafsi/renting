import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/owner_house.dart';

class HousesRepository {
  const HousesRepository();

  Future<List<OwnerHouse>> getOwnerHouses(String ownerId) async {
    if (AppConfig.useDwiraApi) {
      return _fetchFromDwiraApi(ownerId);
    }
    return _fetchFromFirebase(ownerId);
  }

  Future<bool> ownerExists(String ownerId) async {
    if (AppConfig.useDwiraApi) {
      final houses = await _fetchFromDwiraApi(ownerId);
      return houses.isNotEmpty;
    }
    final userDoc =
        await FirebaseFirestore.instance.collection('users').doc(ownerId).get();
    if (!userDoc.exists) return false;
    final data = userDoc.data();
    return data != null && data['role'] == 'owner';
  }

  Future<List<OwnerHouse>> _fetchFromFirebase(String ownerId) async {
    final querySnapshot = await FirebaseFirestore.instance
        .collection('houses')
        .where('ownerId', isEqualTo: ownerId)
        .get();

    return querySnapshot.docs.map((doc) {
      final data = doc.data();
      final photos = (data['photosBase64'] is List)
          ? List<String>.from(data['photosBase64'])
          : const <String>[];
      final hasPending = (data['availabilityPending'] is List) &&
          (data['availabilityPending'] as List).isNotEmpty;

      return OwnerHouse(
        id: doc.id,
        title: _asString(data['name'], fallback: 'Sans titre'),
        photoBase64: photos.isNotEmpty ? photos.first : null,
        cleaningStatus: _asString(data['cleaningStatus'], fallback: 'pending'),
        plumberStatus: _asString(data['plumberStatus'], fallback: 'none'),
        electricianStatus:
            _asString(data['electricianStatus'], fallback: 'none'),
        foodDeliveryStatus:
            _asString(data['foodDeliveryStatus'], fallback: 'none'),
        hasPending: hasPending,
        isFeatured: _isTruthy(data['isFeatured'] ?? data['is_featured']),
        source: 'firebase',
        raw: data,
      );
    }).toList();
  }

  Future<List<OwnerHouse>> _fetchFromDwiraApi(String ownerId) async {
    final baseUrl = AppConfig.dwiraApiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    final response = await http.get(Uri.parse('$baseUrl/api/biens'));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('API biens indisponible (HTTP ${response.statusCode})');
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! List) {
      throw Exception('Format API /api/biens invalide');
    }

    final ownedBiens = decoded
        .whereType<Map>()
        .where((bien) {
          final proprietaireId = _asString(
            bien['proprietaire_id'] ?? bien['ownerId'],
            fallback: '',
          );
          return proprietaireId == ownerId;
        })
        .map((bien) => Map<String, dynamic>.from(bien))
        .toList();

    final bienIds = ownedBiens
        .map((bien) => _asString(bien['id'], fallback: ''))
        .where((id) => id.isNotEmpty)
        .toList();

    final coverByBienId = <String, String>{};
    if (bienIds.isNotEmpty) {
      final mediaResponse = await http.get(
        Uri.parse('$baseUrl/api/media-bulk').replace(
          queryParameters: {'bien_ids': bienIds.join(',')},
        ),
      );
      if (mediaResponse.statusCode >= 200 && mediaResponse.statusCode < 300) {
        final mediaDecoded = jsonDecode(mediaResponse.body);
        if (mediaDecoded is List) {
          for (final raw in mediaDecoded.whereType<Map>()) {
            final media = Map<String, dynamic>.from(raw);
            final bienId = _asString(media['bien_id'], fallback: '');
            final type =
                _asString(media['type'], fallback: 'image').toLowerCase();
            final url =
                _resolveApiUrl(_asString(media['url'], fallback: ''), baseUrl);
            if (bienId.isEmpty || url.isEmpty) continue;
            if (type == 'video') continue;
            coverByBienId.putIfAbsent(bienId, () => url);
          }
        }
      }
    }

    return ownedBiens
        .map((map) {
          final bienId = _asString(map['id'], fallback: '');
          final coverUrl = coverByBienId[bienId] ??
              _resolveApiUrl(
                _asString(
                    map['cover_media_url'] ??
                        map['cover_url'] ??
                        map['image_url'],
                    fallback: ''),
                baseUrl,
              );
          final photoBase64 = _asString(
            map['photoBase64'] ?? map['photo_base64'] ?? map['image_base64'],
            fallback: '',
          );
          final normalizedBase64 = photoBase64.isEmpty ? null : photoBase64;

          return OwnerHouse(
            id: bienId,
            title: _resolveOwnerMobileTitle(map),
            photoBase64: normalizedBase64,
            cleaningStatus: _asString(
              map['cleaningStatus'] ?? map['menage_en_cours'],
              fallback: 'pending',
            ),
            plumberStatus: _asString(map['plumberStatus'], fallback: 'none'),
            electricianStatus:
                _asString(map['electricianStatus'], fallback: 'none'),
            foodDeliveryStatus:
                _asString(map['foodDeliveryStatus'], fallback: 'none'),
            hasPending: false,
            isFeatured: _isTruthy(map['is_featured'] ?? map['isFeatured']),
            source: 'dwira_api',
            raw: {
              ...map,
              if (coverUrl.isNotEmpty) 'cover_media_url': coverUrl,
            },
          );
        })
        .where((house) => house.id.isNotEmpty)
        .toList();
  }

  String _asString(dynamic value, {required String fallback}) {
    final normalized = (value?.toString() ?? '').trim();
    if (normalized.isEmpty || normalized.toLowerCase() == 'null') {
      return fallback;
    }
    return normalized;
  }

  String _resolveOwnerMobileTitle(Map<String, dynamic> map) {
    final direct = _asString(
      map['nom_bien_mobile'] ??
          map['owner_mobile_title'] ??
          map['mobile_display_name'],
      fallback: '',
    );
    if (direct.isNotEmpty) return direct;

    final config = _safeParseJsonMap(map['location_saisonniere_config_json']);
    final fromConfig = _asString(
      config['nom_bien_mobile'] ??
          config['owner_mobile_title'] ??
          config['mobile_display_name'],
      fallback: '',
    );
    if (fromConfig.isNotEmpty) return fromConfig;

    return _asString(
      map['titre'] ?? map['name'] ?? map['reference'],
      fallback: 'Bien sans titre',
    );
  }

  Map<String, dynamic> _safeParseJsonMap(dynamic raw) {
    if (raw is Map) {
      return Map<String, dynamic>.from(raw);
    }
    final text = (raw?.toString() ?? '').trim();
    if (text.isEmpty) return const <String, dynamic>{};
    try {
      final decoded = jsonDecode(text);
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
    } catch (_) {
      // Ignore malformed config and fallback to regular title.
    }
    return const <String, dynamic>{};
  }

  bool _isTruthy(dynamic value) {
    if (value is bool) return value;
    final normalized = (value?.toString() ?? '').trim().toLowerCase();
    return normalized == '1' ||
        normalized == 'true' ||
        normalized == 'yes' ||
        normalized == 'oui';
  }

  String _resolveApiUrl(String value, String baseUrl) {
    final normalized = value.trim();
    if (normalized.isEmpty) return '';
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      return normalized;
    }
    if (normalized.startsWith('/')) {
      return '$baseUrl$normalized';
    }
    return normalized;
  }
}
