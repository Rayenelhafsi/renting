import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';
import 'dart:ui';

import '../config/app_config.dart';
import '../services/dwira_api_service.dart';

class ApiAdminBienDetailsScreen extends StatefulWidget {
  final String bienId;

  const ApiAdminBienDetailsScreen({
    super.key,
    required this.bienId,
  });

  @override
  State<ApiAdminBienDetailsScreen> createState() =>
      _ApiAdminBienDetailsScreenState();
}

class _ApiAdminBienDetailsScreenState extends State<ApiAdminBienDetailsScreen> {
  final DwiraApiService _api = DwiraApiService.instance;

  bool _loading = true;
  String? _error;

  Map<String, dynamic> _bien = const <String, dynamic>{};
  List<Map<String, dynamic>> _media = const <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _unavailableDates = const <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _pendingRequests = const <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _historyRequests = const <Map<String, dynamic>>[];
  final Map<String, String> _localRequestDecisions = <String, String>{};
  final Map<String, Map<String, dynamic>> _localDecisionPayloads =
      <String, Map<String, dynamic>>{};

  DateTime _focusedDay = DateTime.now();

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final bienFuture = _api.fetchBienById(widget.bienId);
      final mediaFuture = _api.fetchBienMedia(widget.bienId);
      final unavailableFuture = _api.fetchUnavailableDates(widget.bienId);
      final pendingFuture =
          _api.fetchCalendarUpdateRequestsAdmin(statuses: {'pending'});
      final historyFuture = _api.fetchCalendarUpdateHistoryAdmin();

      final results = await Future.wait([
        bienFuture,
        mediaFuture,
        unavailableFuture,
        pendingFuture,
        historyFuture,
      ]);

      final bien = results[0] as Map<String, dynamic>;
      final media = results[1] as List<Map<String, dynamic>>;
      final unavailable = results[2] as List<Map<String, dynamic>>;
      final allPendingRequests = results[3] as List<Map<String, dynamic>>;
      final allHistoryRequests = results[4] as List<Map<String, dynamic>>;

      final pendingByBien = allPendingRequests.where((request) {
        final metadata = request['metadata'];
        if (metadata is! Map) return false;
        return (metadata['bienId'] ?? '').toString().trim() == widget.bienId;
      }).toList();
      final historyByBien = allHistoryRequests.where((request) {
        final metadata = request['metadata'];
        if (metadata is! Map) return false;
        return (metadata['bienId'] ?? '').toString().trim() == widget.bienId;
      }).toList();

      final effectivePending = pendingByBien.where((request) {
        final id = (request['id'] ?? '').toString().trim();
        return id.isEmpty || !_localRequestDecisions.containsKey(id);
      }).toList();

      final mergedHistory = <Map<String, dynamic>>[
        ...historyByBien,
      ];
      for (final entry in _localDecisionPayloads.entries) {
        if (mergedHistory
            .any((row) => (row['id'] ?? '').toString() == entry.key)) {
          continue;
        }
        mergedHistory.insert(0, entry.value);
      }

      if (!mounted) return;
      setState(() {
        _bien = bien;
        _media = media;
        _unavailableDates = unavailable;
        _pendingRequests = effectivePending;
        _historyRequests = mergedHistory;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  List<String> _extractFeatures(Map<String, dynamic> bien) {
    final raw = bien['caracteristiques_json'];
    final values = <String>{};

    values.addAll(_decodeFeatureList(raw));

    values.addAll(
      _extractFeaturesFromDescription(
        (_bien['description'] ?? '').toString(),
      ),
    );
    return values.toList();
  }

  List<String> _extractFeaturesFromDescription(String description) {
    final markerRegex = RegExp(
      r'\[CARACTERISTIQUES_JSON\]\s*(.+)$',
      dotAll: true,
      caseSensitive: false,
    );
    final match = markerRegex.firstMatch(description);
    if (match == null) return const <String>[];
    var payload = (match.group(1) ?? '').trim();
    if (payload.isEmpty) return const <String>[];
    if (payload.startsWith('"') && payload.endsWith('"')) {
      try {
        payload = jsonDecode(payload).toString();
      } catch (_) {
        payload = payload.substring(1, payload.length - 1);
      }
    }
    final fromJson = _decodeFeatureList(payload);
    if (fromJson.isNotEmpty) return fromJson;
    return payload
        .replaceAll('[', '')
        .replaceAll(']', '')
        .split(',')
        .map((e) => e.replaceAll('"', '').trim())
        .where((e) => e.isNotEmpty)
        .toList();
  }

  String _cleanDescription(String description) {
    final cleaned = description.replaceAll(
      RegExp(
        r'\[CARACTERISTIQUES_JSON\]\s*.+$',
        dotAll: true,
        caseSensitive: false,
      ),
      '',
    );
    final normalized = cleaned.trim();
    if (normalized.isEmpty) return 'Aucune description';
    return normalized;
  }

  List<String> _decodeFeatureList(dynamic raw) {
    if (raw == null) return const <String>[];
    if (raw is List) {
      return raw
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .toList();
    }

    dynamic decoded = raw.toString().trim();
    if (decoded.toString().isEmpty) return const <String>[];

    for (var i = 0; i < 2; i++) {
      try {
        decoded = jsonDecode(decoded.toString());
      } catch (_) {
        break;
      }
    }

    if (decoded is List) {
      return decoded
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .toList();
    }

    return decoded
        .toString()
        .replaceAll('[', '')
        .replaceAll(']', '')
        .split(',')
        .map((e) => e.replaceAll('"', '').trim())
        .where((e) => e.isNotEmpty)
        .toList();
  }

  String _resolveMediaUrl(String rawUrl) {
    final value = rawUrl.trim();
    if (value.isEmpty) {
      return '';
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    if (value.startsWith('/')) {
      final base = AppConfig.dwiraApiBaseUrl.replaceAll(RegExp(r'/+$'), '');
      return '$base$value';
    }
    return value;
  }

  Set<String> _blockedDays() {
    final days = <String>{};
    for (final row in _unavailableDates) {
      final start = DateTime.tryParse((row['start_date'] ?? '').toString());
      final end = DateTime.tryParse((row['end_date'] ?? '').toString());
      if (start == null || end == null) continue;
      var cursor = DateTime(start.year, start.month, start.day);
      final until = DateTime(end.year, end.month, end.day);
      while (!cursor.isAfter(until)) {
        days.add(DateFormat('yyyy-MM-dd').format(cursor));
        cursor = cursor.add(const Duration(days: 1));
      }
    }
    return days;
  }

  Future<void> _approveRequest(String id) async {
    try {
      await _api.approveCalendarRequestAdmin(id);
      if (mounted) {
        setState(() {
          _localRequestDecisions[id] = 'approved';
          final moved = _pendingRequests.firstWhere(
            (request) => (request['id'] ?? '').toString() == id,
            orElse: () => <String, dynamic>{},
          );
          if (moved.isNotEmpty) {
            final metadata = (moved['metadata'] is Map)
                ? Map<String, dynamic>.from(moved['metadata'] as Map)
                : <String, dynamic>{};
            metadata['status'] = 'approved';
            metadata['reviewedAt'] = DateTime.now().toIso8601String();
            final next = Map<String, dynamic>.from(moved);
            next['metadata'] = metadata;
            _localDecisionPayloads[id] = next;
          }
          _pendingRequests = _pendingRequests
              .where((request) => (request['id'] ?? '').toString() != id)
              .toList();
          if (_localDecisionPayloads[id] != null) {
            _historyRequests = [
              _localDecisionPayloads[id]!,
              ..._historyRequests
                  .where((row) => (row['id'] ?? '').toString() != id),
            ];
          }
        });
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Demande approuvee.')),
      );
      await _loadAll();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erreur approbation: $e')),
      );
    }
  }

  Future<void> _rejectRequest(String id) async {
    try {
      await _api.rejectCalendarRequestAdmin(id);
      if (mounted) {
        setState(() {
          _localRequestDecisions[id] = 'rejected';
          final moved = _pendingRequests.firstWhere(
            (request) => (request['id'] ?? '').toString() == id,
            orElse: () => <String, dynamic>{},
          );
          if (moved.isNotEmpty) {
            final metadata = (moved['metadata'] is Map)
                ? Map<String, dynamic>.from(moved['metadata'] as Map)
                : <String, dynamic>{};
            metadata['status'] = 'rejected';
            metadata['reviewedAt'] = DateTime.now().toIso8601String();
            final next = Map<String, dynamic>.from(moved);
            next['metadata'] = metadata;
            _localDecisionPayloads[id] = next;
          }
          _pendingRequests = _pendingRequests
              .where((request) => (request['id'] ?? '').toString() != id)
              .toList();
          if (_localDecisionPayloads[id] != null) {
            _historyRequests = [
              _localDecisionPayloads[id]!,
              ..._historyRequests
                  .where((row) => (row['id'] ?? '').toString() != id),
            ];
          }
        });
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Demande rejetee.')),
      );
      await _loadAll();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erreur rejet: $e')),
      );
    }
  }

  Widget _glassIconButton({
    required IconData icon,
    required VoidCallback onPressed,
  }) {
    return ClipOval(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Material(
          color: const Color(0x66FFFFFF),
          child: InkWell(
            onTap: onPressed,
            child: Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0x99FFFFFF), width: 1.1),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x26000000),
                    blurRadius: 12,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: Icon(icon, size: 22, color: const Color(0xFF0F172A)),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Detail bien (Admin)')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Text(
              'Erreur detail bien: $_error',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    final title =
        (_bien['titre'] ?? _bien['reference'] ?? widget.bienId).toString();
    final owner = (_bien['proprietaire_nom'] ?? '').toString();
    final location = (_bien['zone_nom'] ?? _bien['quartier'] ?? '').toString();
    final statut = (_bien['statut'] ?? '').toString();
    final prix = (_bien['prix_nuitee'] ?? '').toString();
    final description = _cleanDescription(
      (_bien['description'] ?? 'Aucune description').toString(),
    );
    final features = _extractFeatures(_bien);
    final blockedDays = _blockedDays();

    final coverRaw =
        _media.isNotEmpty ? (_media.first['url'] ?? '').toString() : '';
    final coverUrl = _resolveMediaUrl(coverRaw);

    return Scaffold(
      backgroundColor: const Color(0xFFF3F0F6),
      body: RefreshIndicator(
        onRefresh: _loadAll,
        child: ListView(
          children: [
            SizedBox(
              height: 320,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (coverUrl.isNotEmpty)
                    Image.network(
                      coverUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        color: const Color(0xFFE8ECF0),
                        child: const Icon(Icons.broken_image, size: 56),
                      ),
                    )
                  else
                    Container(
                      color: const Color(0xFFE8ECF0),
                      child: const Icon(
                        Icons.home_work_outlined,
                        size: 72,
                        color: Color(0xFF2F7D4B),
                      ),
                    ),
                  Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0x66000000), Color(0xAA000000)],
                      ),
                    ),
                  ),
                  Positioned(
                    top: MediaQuery.of(context).padding.top + 10,
                    left: 12,
                    child: _glassIconButton(
                      icon: Icons.arrow_back,
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ),
                ],
              ),
            ),
            Transform.translate(
              offset: const Offset(0, -24),
              child: Container(
                decoration: const BoxDecoration(
                  color: Color(0xFFF8F8FA),
                  borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                ),
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE6F6EE),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'DETAIL ADMIN',
                        style: TextStyle(
                          color: Color(0xFF2F7D4B),
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.2,
                          fontSize: 11,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0F172A),
                        height: 1.05,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        _chip(
                            Icons.location_on_outlined,
                            location.isEmpty
                                ? 'Zone non renseignee'
                                : location),
                        _chip(
                            Icons.apartment_outlined,
                            owner.isEmpty
                                ? 'Proprietaire non renseigne'
                                : owner),
                        _chip(Icons.info_outline,
                            'Statut: ${statut.isEmpty ? '-' : statut}'),
                        _chip(Icons.payments_outlined,
                            'Prix/nuit: ${prix.isEmpty ? '-' : prix}'),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _sectionCard(
                      title: 'Description',
                      child: Text(
                        description,
                        style: const TextStyle(
                            fontSize: 15, color: Color(0xFF334155)),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _sectionCard(
                      title: 'Caracteristiques',
                      child: features.isEmpty
                          ? const Text('Aucune caracteristique disponible')
                          : Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: features
                                  .map((feature) => Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 10, vertical: 6),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFFF1F5F9),
                                          borderRadius:
                                              BorderRadius.circular(999),
                                        ),
                                        child: Text(feature),
                                      ))
                                  .toList(),
                            ),
                    ),
                    const SizedBox(height: 12),
                    _sectionCard(
                      title: 'Calendrier',
                      child: TableCalendar(
                        focusedDay: _focusedDay,
                        firstDay: DateTime.utc(2024, 1, 1),
                        lastDay: DateTime.utc(2031, 12, 31),
                        availableCalendarFormats: const {
                          CalendarFormat.month: 'Month',
                        },
                        headerStyle: HeaderStyle(
                          formatButtonVisible: false,
                          titleCentered: true,
                          leftChevronIcon: _glassChevron(Icons.chevron_left),
                          rightChevronIcon: _glassChevron(Icons.chevron_right),
                        ),
                        onPageChanged: (value) =>
                            setState(() => _focusedDay = value),
                        calendarBuilders: CalendarBuilders(
                          defaultBuilder: (context, day, focusedDay) {
                            final key = DateFormat('yyyy-MM-dd').format(day);
                            final isBlocked = blockedDays.contains(key);
                            return _calendarDay(day, isBlocked);
                          },
                          todayBuilder: (context, day, focusedDay) {
                            final key = DateFormat('yyyy-MM-dd').format(day);
                            final isBlocked = blockedDays.contains(key);
                            return _calendarDay(day, isBlocked, isToday: true);
                          },
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _sectionCard(
                      title: 'Demandes calendrier a approuver',
                      child: _pendingRequests.isEmpty
                          ? const Text(
                              'Aucune demande en attente pour ce bien.')
                          : Column(
                              children: _pendingRequests.map((request) {
                                final metadata = (request['metadata'] is Map)
                                    ? Map<String, dynamic>.from(
                                        request['metadata'] as Map)
                                    : <String, dynamic>{};
                                final ownerId =
                                    (metadata['ownerId'] ?? '').toString();
                                final startDate =
                                    (metadata['startDate'] ?? '').toString();
                                final endDate =
                                    (metadata['endDate'] ?? '').toString();
                                final requestType =
                                    (metadata['requestType'] ?? 'close')
                                        .toString();
                                final note =
                                    (metadata['note'] ?? '').toString();
                                final requestId =
                                    (request['id'] ?? '').toString();

                                return Container(
                                  margin: const EdgeInsets.only(bottom: 10),
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF8FAFC),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                        color: const Color(0xFFE5E7EB)),
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text('Owner: $ownerId'),
                                      Text(
                                        'Type: ${requestType == 'open' ? 'Reouverture' : 'Fermeture'}',
                                      ),
                                      Text('Plage: $startDate -> $endDate'),
                                      if (note.isNotEmpty) Text('Note: $note'),
                                      const SizedBox(height: 8),
                                      Row(
                                        children: [
                                          Expanded(
                                            child: ElevatedButton.icon(
                                              onPressed: requestId.isEmpty
                                                  ? null
                                                  : () => _approveRequest(
                                                      requestId),
                                              icon: const Icon(
                                                  Icons.check_circle_outline),
                                              label: const Text('Approve'),
                                              style: ElevatedButton.styleFrom(
                                                backgroundColor:
                                                    const Color(0xFF2F7D4B),
                                                foregroundColor: Colors.white,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: OutlinedButton.icon(
                                              onPressed: requestId.isEmpty
                                                  ? null
                                                  : () =>
                                                      _rejectRequest(requestId),
                                              icon: const Icon(Icons.close),
                                              label: const Text('Reject'),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                );
                              }).toList(),
                            ),
                    ),
                    const SizedBox(height: 12),
                    _sectionCard(
                      title: 'Demandes traitees',
                      child: _historyRequests.isEmpty
                          ? const Text('Aucune demande traitee pour ce bien.')
                          : Column(
                              children: _historyRequests.map((request) {
                                final metadata = (request['metadata'] is Map)
                                    ? Map<String, dynamic>.from(
                                        request['metadata'] as Map)
                                    : <String, dynamic>{};
                                final ownerId =
                                    (metadata['ownerId'] ?? '').toString();
                                final startDate =
                                    (metadata['startDate'] ?? '').toString();
                                final endDate =
                                    (metadata['endDate'] ?? '').toString();
                                final requestType =
                                    (metadata['requestType'] ?? 'close')
                                        .toString();
                                final status = (metadata['status'] ?? '')
                                    .toString()
                                    .toLowerCase();
                                final reviewedAt =
                                    (metadata['reviewedAt'] ?? '').toString();
                                final isApproved = status == 'approved';

                                return Container(
                                  margin: const EdgeInsets.only(bottom: 10),
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: isApproved
                                        ? const Color(0xFFEAF6EE)
                                        : const Color(0xFFFFF7ED),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: isApproved
                                          ? const Color(0xFFBFE7CC)
                                          : const Color(0xFFFED7AA),
                                    ),
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text('Owner: $ownerId'),
                                      Text(
                                          'Type: ${requestType == 'open' ? 'Reouverture' : 'Fermeture'}'),
                                      Text('Plage: $startDate -> $endDate'),
                                      Text(
                                          'Statut: ${isApproved ? 'Approuvee' : 'Rejetee'}'),
                                      if (reviewedAt.isNotEmpty)
                                        Text('Traitee le: $reviewedAt'),
                                    ],
                                  ),
                                );
                              }).toList(),
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _glassChevron(IconData icon) {
    return ClipOval(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
        child: Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0x4DFFFFFF),
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0x80FFFFFF)),
          ),
          child: Icon(icon, size: 18, color: const Color(0xFF0F172A)),
        ),
      ),
    );
  }

  Widget _sectionCard({
    required String title,
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE9ECF1)),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: Color(0xFF0F5132),
            ),
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }

  Widget _chip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F6F8),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: const Color(0xFF4B5563)),
          const SizedBox(width: 6),
          Text(label),
        ],
      ),
    );
  }

  Widget _calendarDay(DateTime day, bool isBlocked, {bool isToday = false}) {
    return Center(
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: isBlocked ? const Color(0xFFE77777) : const Color(0xFFEAF6EE),
          shape: BoxShape.circle,
          border: isToday
              ? Border.all(color: const Color(0xFF0F5132), width: 2)
              : null,
        ),
        alignment: Alignment.center,
        child: Text(
          '${day.day}',
          style: TextStyle(
            color: isBlocked ? Colors.white : const Color(0xFF2F7D4B),
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
