import 'dart:convert';
import 'dart:async';
import 'dart:typed_data';
import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';

import '../config/app_config.dart';
import '../models/owner_house.dart';
import '../services/dwira_api_service.dart';
import '../services/ui_language_service.dart';
import '../widgets/app_cached_image.dart';

class ApiHouseDetailsScreen extends StatefulWidget {
  final OwnerHouse house;
  final String ownerId;
  final bool closeOnSuccessfulSubmit;

  const ApiHouseDetailsScreen({
    super.key,
    required this.house,
    required this.ownerId,
    this.closeOnSuccessfulSubmit = false,
  });

  @override
  State<ApiHouseDetailsScreen> createState() => _ApiHouseDetailsScreenState();
}

class _ApiHouseDetailsScreenState extends State<ApiHouseDetailsScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  final DwiraApiService _api = DwiraApiService.instance;
  DateTime _focusedDay = DateTime.now();
  DateTime? _start;
  DateTime? _end;
  bool _submitting = false;
  String? _cancellingPendingRequestId;
  final TextEditingController _noteController = TextEditingController();
  late final AnimationController _pendingGlowController;
  Timer? _calendarAutoRefreshTimer;

  Set<String> _blockedDays = <String>{};
  List<Map<String, dynamic>> _pendingCalendarRequests =
      const <Map<String, dynamic>>[];
  List<Map<String, dynamic>> _reservationStatusRows =
      const <Map<String, dynamic>>[];
  _CalendarChangeMode _changeMode = _CalendarChangeMode.close;
  List<_GalleryEntry> _galleryEntries = const <_GalleryEntry>[];
  bool _galleryLoading = false;
  int _selectedGalleryIndex = 0;
  String t(String key) => UiLanguageService.t(key);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _pendingGlowController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
    _loadCalendar();
    _loadGallery();
    _calendarAutoRefreshTimer = Timer.periodic(
      const Duration(seconds: 12),
      (_) => _loadCalendar(silent: true),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _calendarAutoRefreshTimer?.cancel();
    _pendingGlowController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadCalendar(silent: true);
    }
  }

  Future<void> _loadCalendar({bool silent = false}) async {
    try {
      final results = await Future.wait<List<Map<String, dynamic>>>([
        _api.fetchUnavailableDates(widget.house.id),
        _api.fetchOwnerPendingCalendarRequests(
          widget.ownerId,
          bienId: widget.house.id,
        ),
        _api.fetchOwnerReservationStatuses(
          widget.ownerId,
          bienId: widget.house.id,
        ),
      ]);
      final rows = results[0];
      final pendingRows = results[1];
      final reservationRows = results[2];
      final next = <String>{};
      for (final row in rows) {
        final startRaw = (row['start_date'] ?? '').toString();
        final endRaw = (row['end_date'] ?? '').toString();
        if (startRaw.isEmpty || endRaw.isEmpty) continue;
        final start = DateTime.tryParse(startRaw);
        final end = DateTime.tryParse(endRaw);
        if (start == null || end == null) continue;
        var cursor = DateTime(start.year, start.month, start.day);
        final until = DateTime(end.year, end.month, end.day);
        while (!cursor.isAfter(until)) {
          next.add(DateFormat('yyyy-MM-dd').format(cursor));
          cursor = cursor.add(const Duration(days: 1));
        }
      }
      if (!mounted) return;
      setState(() {
        _blockedDays = next;
        _pendingCalendarRequests = pendingRows;
        _reservationStatusRows = reservationRows;
      });
    } catch (e) {
      if (!mounted || silent) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Chargement calendrier impossible: $e')),
      );
    }
  }

  Future<void> _reloadDetails() async {
    await Future.wait([
      _loadCalendar(),
      _loadGallery(),
    ]);
  }

  Future<void> _loadGallery() async {
    if (!mounted) return;
    setState(() {
      _galleryLoading = true;
    });

    final fallbackEntries = _buildFallbackGalleryEntries();
    try {
      final rows = await _api.fetchBienMedia(widget.house.id);
      final entries = _buildGalleryEntries(rows, fallbackEntries);
      if (!mounted) return;
      setState(() {
        _galleryEntries = entries;
        _selectedGalleryIndex = 0;
      });
      await _precacheGallery(entries);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _galleryEntries = fallbackEntries;
        _selectedGalleryIndex = 0;
      });
    } finally {
      if (mounted) {
        setState(() {
          _galleryLoading = false;
        });
      }
    }
  }

  void _onDaySelected(DateTime selectedDay, DateTime focusedDay) {
    if (_changeMode == _CalendarChangeMode.open &&
        _isProtectedReservationDay(selectedDay)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Cette date est reservee pour une reservation. Elle ne peut pas etre rouverte.',
          ),
        ),
      );
      setState(() => _focusedDay = focusedDay);
      return;
    }
    setState(() {
      _focusedDay = focusedDay;
      if (_start == null || (_start != null && _end != null)) {
        _start = selectedDay;
        _end = null;
      } else {
        if (selectedDay.isBefore(_start!)) {
          _end = _start;
          _start = selectedDay;
        } else {
          _end = selectedDay;
        }
      }
    });
  }

  bool _isInSelectedRange(DateTime day) {
    if (_start == null) return false;
    final d = DateTime(day.year, day.month, day.day);
    final s = DateTime(_start!.year, _start!.month, _start!.day);
    final e = _end == null ? s : DateTime(_end!.year, _end!.month, _end!.day);
    return !d.isBefore(s) && !d.isAfter(e);
  }

  bool _isSameCalendarDay(DateTime? a, DateTime? b) {
    if (a == null || b == null) return false;
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  bool _isDateWithinRange(DateTime day, DateTime start, DateTime end) {
    final d = DateTime(day.year, day.month, day.day);
    final s = DateTime(start.year, start.month, start.day);
    final e = DateTime(end.year, end.month, end.day);
    return !d.isBefore(s) && !d.isAfter(e);
  }

  bool _isProtectedReservationDay(DateTime day) {
    final current = _activeReservationStatus();
    if (current == null) return false;
    final status = (current['status'] ?? '').toString();
    if (!_isFinalReservationStatus(status)) return false;
    final start = _parseDateOnly((current['start_date'] ?? '').toString());
    final end = _parseDateOnly((current['end_date'] ?? '').toString());
    if (start == null || end == null) return false;
    return _isDateWithinRange(day, start, end);
  }

  DateTime? _parseDateOnly(String raw) {
    final normalized = raw.trim();
    if (normalized.isEmpty) return null;
    final parsed = DateTime.tryParse(normalized);
    if (parsed == null) return null;
    return DateTime(parsed.year, parsed.month, parsed.day);
  }

  String _formatAvailabilityDate(String rawDate) {
    final parsed = DateTime.tryParse(rawDate.trim());
    if (parsed == null) return rawDate;
    return DateFormat(
      'dd MMMM yyyy',
      UiLanguageService.localeName(UiLanguageService.current.value),
    ).format(parsed);
  }

  String _pendingRequestStatus(Map<String, dynamic> row) {
    return (row['status'] ?? 'pending').toString().trim().toLowerCase();
  }

  Map<String, dynamic>? _primaryPendingRequest() {
    if (_pendingCalendarRequests.isEmpty) return null;
    final rows = [..._pendingCalendarRequests];
    rows.sort((left, right) {
      final leftStatus =
          _pendingRequestStatus(left) == 'cancel_pending' ? 1 : 0;
      final rightStatus =
          _pendingRequestStatus(right) == 'cancel_pending' ? 1 : 0;
      if (leftStatus != rightStatus) return rightStatus - leftStatus;
      return ((right['submittedAt'] ?? right['dateTime'] ?? '').toString())
          .compareTo(
              (left['submittedAt'] ?? left['dateTime'] ?? '').toString());
    });
    return rows.first;
  }

  String _pendingRequestLabel(Map<String, dynamic> row) {
    final requestType =
        ((row['requestType'] ?? 'close').toString().trim().toLowerCase() ==
                'open')
            ? 'open'
            : 'close';
    final status = _pendingRequestStatus(row);
    if (status == 'cancel_pending') {
      return 'Annulation de reouverture en attente';
    }
    return requestType == 'open'
        ? 'Reouverture en attente d approbation admin'
        : 'Fermeture en attente d approbation admin';
  }

  String _pendingRequestCaption(Map<String, dynamic> row) {
    final startDate = (row['startDate'] ?? '').toString();
    final endDate = (row['endDate'] ?? '').toString();
    final requestType =
        ((row['requestType'] ?? 'close').toString().trim().toLowerCase() ==
                'open')
            ? 'open'
            : 'close';
    final status = _pendingRequestStatus(row);
    final period =
        'Periode: ${_formatAvailabilityDate(startDate)} - ${_formatAvailabilityDate(endDate)}';
    if (status == 'cancel_pending') {
      return '$period\nVotre demande d annulation de reouverture attend la confirmation admin.';
    }
    return '$period\n${requestType == 'open' ? 'Le calendrier reste en attente de reouverture.' : 'La fermeture sera appliquee apres validation admin.'}';
  }

  Future<void> _cancelPendingRequest(Map<String, dynamic> row) async {
    final interactionId = (row['id'] ?? '').toString().trim();
    if (interactionId.isEmpty) return;
    final requestType =
        ((row['requestType'] ?? 'close').toString().trim().toLowerCase() ==
                'open')
            ? 'open'
            : 'close';
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Confirmer annulation'),
            content: Text(
              requestType == 'open'
                  ? 'Etes vous sur d annuler cette demande de reouverture ?'
                  : 'Etes vous sur d annuler cette demande de fermeture ?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: const Text('Non'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(dialogContext).pop(true),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  foregroundColor: Colors.white,
                ),
                child: const Text('Oui'),
              ),
            ],
          ),
        ) ??
        false;
    if (!confirmed || !mounted) return;

    setState(() => _cancellingPendingRequestId = interactionId);
    try {
      final result = await _api.cancelOwnerCalendarRequest(
        ownerId: widget.ownerId,
        interactionId: interactionId,
      );
      if (!mounted) return;
      final mode = (result['mode'] ?? '').toString();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            mode == 'cancel_pending'
                ? 'Demande d annulation envoyee a l admin.'
                : 'Demande annulee.',
          ),
        ),
      );
      await _loadCalendar();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Annulation demande impossible: $e')),
      );
    } finally {
      if (mounted) {
        setState(() => _cancellingPendingRequestId = null);
      }
    }
  }

  Widget _pendingRequestCard() {
    final row = _primaryPendingRequest();
    if (row == null) return const SizedBox.shrink();
    final status = _pendingRequestStatus(row);
    final requestId = (row['id'] ?? '').toString().trim();
    final note = (row['note'] ?? '').toString().trim();
    final canCancel = requestId.isNotEmpty && status == 'pending';
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFEFF6FF), Color(0xFFDBEAFE)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border:
            Border.all(color: const Color(0xFF60A5FA).withValues(alpha: 0.55)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF3B82F6).withValues(alpha: 0.16),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'DEMANDE CALENDRIER EN ATTENTE',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.05,
                    color: Color(0xFF1D4ED8),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _pendingRequestLabel(row),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF1E3A8A),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _pendingRequestCaption(row),
                  style: const TextStyle(
                    color: Color(0xFF1E40AF),
                    height: 1.4,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (note.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Note: $note',
                    style: const TextStyle(
                      color: Color(0xFF1D4ED8),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (canCancel || status == 'cancel_pending')
            const SizedBox(width: 12),
          if (canCancel)
            FilledButton(
              onPressed: _cancellingPendingRequestId == requestId
                  ? null
                  : () => _cancelPendingRequest(row),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
              ),
              child: Text(
                _cancellingPendingRequestId == requestId
                    ? 'Annulation...'
                    : 'Annuler',
              ),
            )
          else if (status == 'cancel_pending')
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFBFDBFE),
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text(
                'Attente admin',
                style: TextStyle(
                  color: Color(0xFF1E3A8A),
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
        ],
      ),
    );
  }

  _PendingRangeVisual _pendingVisualForDay(DateTime day) {
    for (final row in _pendingCalendarRequests) {
      final start = _parseDateOnly((row['startDate'] ?? '').toString());
      final end = _parseDateOnly((row['endDate'] ?? '').toString());
      if (start == null || end == null) continue;
      if (!_isDateWithinRange(day, start, end)) continue;

      final isSingle = _isSameCalendarDay(start, end);
      final isStart = _isSameCalendarDay(day, start);
      final isEnd = _isSameCalendarDay(day, end);
      return _PendingRangeVisual(
        active: true,
        requestType:
            ((row['requestType'] ?? 'close').toString().trim().toLowerCase() ==
                    'open')
                ? 'open'
                : 'close',
        isSingleDay: isSingle,
        isStart: isStart,
        isEnd: isEnd,
        isMiddle: !isSingle && !isStart && !isEnd,
      );
    }
    return const _PendingRangeVisual.inactive();
  }

  Map<String, dynamic>? _activeReservationStatus() {
    if (_reservationStatusRows.isEmpty) return null;
    return _reservationStatusRows.first;
  }

  bool _isFinalReservationStatus(String status) {
    final normalized = status.trim();
    return normalized == 'succes_paiement' || normalized == 'contrat_realise';
  }

  _ReservationRangeVisual _reservationVisualForDay(DateTime day) {
    final current = _activeReservationStatus();
    if (current == null) return const _ReservationRangeVisual.inactive();
    final status = (current['status'] ?? '').toString();
    if (_isFinalReservationStatus(status)) {
      return const _ReservationRangeVisual.inactive();
    }
    final start = _parseDateOnly((current['start_date'] ?? '').toString());
    final end = _parseDateOnly((current['end_date'] ?? '').toString());
    if (start == null || end == null) {
      return const _ReservationRangeVisual.inactive();
    }
    if (!_isDateWithinRange(day, start, end)) {
      return const _ReservationRangeVisual.inactive();
    }
    final isSingle = _isSameCalendarDay(start, end);
    final isStart = _isSameCalendarDay(day, start);
    final isEnd = _isSameCalendarDay(day, end);
    return _ReservationRangeVisual(
      active: true,
      isSingleDay: isSingle,
      isStart: isStart,
      isEnd: isEnd,
      isMiddle: !isSingle && !isStart && !isEnd,
    );
  }

  _ReservationRangeVisual _confirmedReservationVisualForDay(DateTime day) {
    final current = _activeReservationStatus();
    if (current == null) return const _ReservationRangeVisual.inactive();
    final status = (current['status'] ?? '').toString();
    if (!_isFinalReservationStatus(status)) {
      return const _ReservationRangeVisual.inactive();
    }
    final start = _parseDateOnly((current['start_date'] ?? '').toString());
    final end = _parseDateOnly((current['end_date'] ?? '').toString());
    if (start == null || end == null) {
      return const _ReservationRangeVisual.inactive();
    }
    if (!_isDateWithinRange(day, start, end)) {
      return const _ReservationRangeVisual.inactive();
    }
    final isSingle = _isSameCalendarDay(start, end);
    final isStart = _isSameCalendarDay(day, start);
    final isEnd = _isSameCalendarDay(day, end);
    return _ReservationRangeVisual(
      active: true,
      isSingleDay: isSingle,
      isStart: isStart,
      isEnd: isEnd,
      isMiddle: !isSingle && !isStart && !isEnd,
    );
  }

  String _reservationStatusLabel(String status) {
    switch (status.trim()) {
      case 'reponse_positive_attente_confirmation_client':
        return t('reservation_status_waiting_client');
      case 'client_procede_vers_paiement_en_cours':
        return t('reservation_status_client_payment');
      case 'demande_recu_paiement':
      case 'recu_paiement_envoye':
        return t('reservation_status_receipt_sent');
      case 'succes_paiement':
        return t('reservation_status_payment_success');
      case 'contrat_realise':
        return t('reservation_status_contract_done');
      default:
        return status;
    }
  }

  String _reservationStatusCaption(Map<String, dynamic> row) {
    final start = (row['start_date'] ?? '').toString();
    final end = (row['end_date'] ?? '').toString();
    final guests = (row['guests'] ?? '1').toString();
    return '${t('reservation_tracking_period')}: ${_formatAvailabilityDate(start)} - ${_formatAvailabilityDate(end)} • ${t('availability_travelers')}: $guests';
  }

  Widget _reservationStatusCard() {
    final current = _activeReservationStatus();
    if (current == null) return const SizedBox.shrink();
    final status = (current['status'] ?? '').toString();
    final finalStatus = _isFinalReservationStatus(status);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: finalStatus
              ? const [Color(0xFFFFF1F1), Color(0xFFFED7D7)]
              : const [Color(0xFFFFFBEB), Color(0xFFFEF3C7)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: finalStatus
              ? const Color(0xFFE77777).withValues(alpha: 0.45)
              : const Color(0xFFF59E0B).withValues(alpha: 0.35),
        ),
        boxShadow: [
          BoxShadow(
            color: (finalStatus
                    ? const Color(0xFFE77777)
                    : const Color(0xFFF59E0B))
                .withValues(alpha: 0.14),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t('reservation_tracking_title'),
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
              color: finalStatus
                  ? const Color(0xFF991B1B)
                  : const Color(0xFF92400E),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: finalStatus
                  ? const Color(0xFFFFE4E6)
                  : const Color(0xFFFFF7D6),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              _reservationStatusLabel(status),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: finalStatus
                    ? const Color(0xFF991B1B)
                    : const Color(0xFF7C2D12),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            _reservationStatusCaption(current),
            style: TextStyle(
              color: finalStatus
                  ? const Color(0xFF7F1D1D)
                  : const Color(0xFF6B4F1D),
              fontWeight: FontWeight.w600,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  bool _rangeContainsBlockedDays() {
    if (_start == null || _end == null) return false;
    final s = DateTime(_start!.year, _start!.month, _start!.day);
    final e = DateTime(_end!.year, _end!.month, _end!.day);
    var cursor = s;
    while (!cursor.isAfter(e)) {
      if (_blockedDays.contains(DateFormat('yyyy-MM-dd').format(cursor))) {
        return true;
      }
      cursor = cursor.add(const Duration(days: 1));
    }
    return false;
  }

  bool _rangeContainsProtectedReservationDays() {
    if (_start == null || _end == null) return false;
    final s = DateTime(_start!.year, _start!.month, _start!.day);
    final e = DateTime(_end!.year, _end!.month, _end!.day);
    var cursor = s;
    while (!cursor.isAfter(e)) {
      if (_isProtectedReservationDay(cursor)) {
        return true;
      }
      cursor = cursor.add(const Duration(days: 1));
    }
    return false;
  }

  bool _rangeContainsAvailableDays() {
    if (_start == null || _end == null) return false;
    final s = DateTime(_start!.year, _start!.month, _start!.day);
    final e = DateTime(_end!.year, _end!.month, _end!.day);
    var cursor = s;
    while (!cursor.isAfter(e)) {
      if (!_blockedDays.contains(DateFormat('yyyy-MM-dd').format(cursor))) {
        return true;
      }
      cursor = cursor.add(const Duration(days: 1));
    }
    return false;
  }

  Future<void> _submitForApproval() async {
    if (_start == null || _end == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Selectionnez une plage de dates.')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      final start = DateFormat('yyyy-MM-dd').format(_start!);
      final end = DateFormat('yyyy-MM-dd').format(_end!);

      if (_changeMode == _CalendarChangeMode.open &&
          _rangeContainsProtectedReservationDays()) {
        throw Exception(
            'Selection invalide: cette plage contient des dates reservees qui ne peuvent pas etre rouvertes.');
      }
      if (_changeMode == _CalendarChangeMode.open &&
          !_rangeContainsBlockedDays()) {
        throw Exception(
            'Selection invalide: la plage ne contient aucune date rouge a rouvrir.');
      }
      if (_changeMode == _CalendarChangeMode.close &&
          !_rangeContainsAvailableDays()) {
        throw Exception('Selection invalide: la plage est deja fermee.');
      }

      await _api.submitCalendarUpdateRequest(
        ownerId: widget.ownerId,
        bienId: widget.house.id,
        propertyTitle: widget.house.title,
        startDate: start,
        endDate: end,
        requestType:
            _changeMode == _CalendarChangeMode.close ? 'close' : 'open',
        note: _noteController.text,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _changeMode == _CalendarChangeMode.close
                ? 'Demande de fermeture envoyee. En attente d approbation admin.'
                : 'Demande de reouverture envoyee. En attente d approbation admin.',
          ),
        ),
      );
      if (widget.closeOnSuccessfulSubmit) {
        Navigator.of(context).pop(true);
        return;
      }
      await _loadCalendar(silent: true);
      setState(() {
        _start = null;
        _end = null;
        _noteController.clear();
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Envoi demande impossible: $e')),
      );
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  Widget _buildDay(DateTime day) {
    final dayKey = DateFormat('yyyy-MM-dd').format(day);
    final blocked = _blockedDays.contains(dayKey);
    final pendingVisual = _pendingVisualForDay(day);
    final hasPendingOverlay = pendingVisual.active;
    final reservationVisual = _reservationVisualForDay(day);
    final hasReservationOverlay = reservationVisual.active;
    final confirmedReservationVisual = _confirmedReservationVisualForDay(day);
    final hasConfirmedReservationOverlay = confirmedReservationVisual.active;
    final previousDay = DateTime(day.year, day.month, day.day - 1);
    final nextDay = DateTime(day.year, day.month, day.day + 1);
    final previousBlocked =
        _blockedDays.contains(DateFormat('yyyy-MM-dd').format(previousDay));
    final nextBlocked =
        _blockedDays.contains(DateFormat('yyyy-MM-dd').format(nextDay));
    final inRange = _isInSelectedRange(day);
    final isStart = _isSameCalendarDay(day, _start);
    final isEnd = _isSameCalendarDay(day, _end);
    final isSingleDaySelection =
        _start != null && (_end == null || _isSameCalendarDay(_start, _end));
    final selectableInCurrentMode =
        _changeMode == _CalendarChangeMode.close ? !blocked : blocked;
    final highlightedRange = inRange && selectableInCurrentMode;
    final baseBg = blocked ? const Color(0xFFEFA2A2) : const Color(0xFFEAF6EE);
    final baseFg = blocked ? Colors.white : const Color(0xFF2F7D4B);
    final rangeBg = _changeMode == _CalendarChangeMode.close
        ? const Color(0xFFE77777)
        : const Color(0xFF2F7D4B);
    final pendingPulse =
        Curves.easeInOut.transform(_pendingGlowController.value);
    final pendingBg = pendingVisual.requestType == 'open'
        ? Color.lerp(
              const Color(0xFFEF4444),
              const Color(0xFF22C55E),
              pendingPulse,
            ) ??
            const Color(0xFF22C55E)
        : Color.lerp(
              const Color(0xFF2563EB),
              const Color(0xFF60A5FA),
              pendingPulse,
            ) ??
            const Color(0xFF3B82F6);
    final reservationBg = Color.lerp(
          const Color(0xFFFACC15),
          const Color(0xFFF59E0B),
          _pendingGlowController.value,
        ) ??
        const Color(0xFFFACC15);
    final existingBlockedStart = blocked && !previousBlocked;
    final existingBlockedEnd = blocked && !nextBlocked;
    final existingBoundaryHalf = !highlightedRange &&
        !isSingleDaySelection &&
        ((existingBlockedStart && !existingBlockedEnd) ||
            (existingBlockedEnd && !existingBlockedStart));
    final confirmedBoundaryHalf = hasConfirmedReservationOverlay &&
        !confirmedReservationVisual.isSingleDay &&
        ((confirmedReservationVisual.isStart &&
                !confirmedReservationVisual.isEnd) ||
            (confirmedReservationVisual.isEnd &&
                !confirmedReservationVisual.isStart));
    final isBoundaryHalf = highlightedRange &&
        !isSingleDaySelection &&
        ((isStart && !isEnd) || (isEnd && !isStart));
    final isMiddleRange =
        highlightedRange && !isSingleDaySelection && !isStart && !isEnd;
    final textColor = isBoundaryHalf
        ? rangeBg
        : confirmedBoundaryHalf
            ? const Color(0xFFE77777)
        : hasConfirmedReservationOverlay
            ? Colors.white
        : hasReservationOverlay &&
                (reservationVisual.isMiddle || reservationVisual.isSingleDay)
            ? Colors.white
            : hasPendingOverlay &&
                    (pendingVisual.isMiddle || pendingVisual.isSingleDay)
                ? Colors.white
                : hasPendingOverlay
                    ? pendingBg
                    : hasReservationOverlay
                        ? reservationBg
                        : existingBoundaryHalf
                            ? const Color(0xFFE77777)
                            : highlightedRange
                                ? Colors.white
                                : baseFg;

    return Center(
      child: SizedBox(
        width: 46,
        height: 38,
        child: Stack(
          alignment: Alignment.center,
          children: [
            if (highlightedRange && !isSingleDaySelection)
              Positioned.fill(
                child: Align(
                  alignment: isStart && !isEnd
                      ? Alignment.centerRight
                      : isEnd && !isStart
                          ? Alignment.centerLeft
                          : Alignment.center,
                  child: Container(
                    width: isStart || isEnd ? 23 : 46,
                    decoration: BoxDecoration(
                      color: rangeBg,
                      borderRadius: BorderRadius.horizontal(
                        left: Radius.circular(isEnd && !isStart ? 19 : 0),
                        right: Radius.circular(isStart && !isEnd ? 19 : 0),
                      ),
                    ),
                  ),
                ),
              ),
            if (hasPendingOverlay && !pendingVisual.isSingleDay)
              Positioned.fill(
                child: Align(
                  alignment: pendingVisual.isStart && !pendingVisual.isEnd
                      ? Alignment.centerRight
                      : pendingVisual.isEnd && !pendingVisual.isStart
                          ? Alignment.centerLeft
                          : Alignment.center,
                  child: AnimatedBuilder(
                    animation: _pendingGlowController,
                    builder: (context, child) => Container(
                      width: pendingVisual.isStart || pendingVisual.isEnd
                          ? 23
                          : 46,
                      decoration: BoxDecoration(
                        color: pendingBg.withValues(alpha: 0.92),
                        boxShadow: [
                          BoxShadow(
                            color: pendingBg.withValues(
                              alpha:
                                  0.28 + (_pendingGlowController.value * 0.22),
                            ),
                            blurRadius: 10 + (_pendingGlowController.value * 8),
                            spreadRadius:
                                0.6 + (_pendingGlowController.value * 1.4),
                          ),
                        ],
                        borderRadius: BorderRadius.horizontal(
                          left: Radius.circular(
                            pendingVisual.isEnd && !pendingVisual.isStart
                                ? 19
                                : 0,
                          ),
                          right: Radius.circular(
                            pendingVisual.isStart && !pendingVisual.isEnd
                                ? 19
                                : 0,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            if (hasConfirmedReservationOverlay &&
                !confirmedReservationVisual.isSingleDay)
              Positioned.fill(
                child: Align(
                  alignment: confirmedReservationVisual.isStart &&
                          !confirmedReservationVisual.isEnd
                      ? Alignment.centerRight
                      : confirmedReservationVisual.isEnd &&
                              !confirmedReservationVisual.isStart
                          ? Alignment.centerLeft
                          : Alignment.center,
                  child: Container(
                    width: confirmedReservationVisual.isStart ||
                            confirmedReservationVisual.isEnd
                        ? 23
                        : 46,
                    decoration: BoxDecoration(
                      color: const Color(0xFFE77777),
                      borderRadius: BorderRadius.horizontal(
                        left: Radius.circular(
                          confirmedReservationVisual.isEnd &&
                                  !confirmedReservationVisual.isStart
                              ? 19
                              : 0,
                        ),
                        right: Radius.circular(
                          confirmedReservationVisual.isStart &&
                                  !confirmedReservationVisual.isEnd
                              ? 19
                              : 0,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            if (hasReservationOverlay && !reservationVisual.isSingleDay)
              Positioned.fill(
                child: Align(
                  alignment: reservationVisual.isStart &&
                          !reservationVisual.isEnd
                      ? Alignment.centerRight
                      : reservationVisual.isEnd && !reservationVisual.isStart
                          ? Alignment.centerLeft
                          : Alignment.center,
                  child: AnimatedBuilder(
                    animation: _pendingGlowController,
                    builder: (context, child) => Container(
                      width:
                          reservationVisual.isStart || reservationVisual.isEnd
                              ? 23
                              : 46,
                      decoration: BoxDecoration(
                        color: reservationBg.withValues(alpha: 0.95),
                        boxShadow: [
                          BoxShadow(
                            color: reservationBg.withValues(
                              alpha:
                                  0.30 + (_pendingGlowController.value * 0.20),
                            ),
                            blurRadius: 11 + (_pendingGlowController.value * 9),
                            spreadRadius:
                                0.8 + (_pendingGlowController.value * 1.2),
                          ),
                        ],
                        borderRadius: BorderRadius.horizontal(
                          left: Radius.circular(
                            reservationVisual.isEnd &&
                                    !reservationVisual.isStart
                                ? 19
                                : 0,
                          ),
                          right: Radius.circular(
                            reservationVisual.isStart &&
                                    !reservationVisual.isEnd
                                ? 19
                                : 0,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color:
                    isMiddleRange || (highlightedRange && isSingleDaySelection)
                        ? rangeBg
                        : confirmedBoundaryHalf
                            ? const Color(0xFFEAF6EE)
                        : hasConfirmedReservationOverlay
                            ? const Color(0xFFE77777)
                        : hasReservationOverlay &&
                                (reservationVisual.isMiddle ||
                                    reservationVisual.isSingleDay)
                            ? reservationBg
                            : hasPendingOverlay &&
                                    (pendingVisual.isMiddle ||
                                        pendingVisual.isSingleDay)
                                ? pendingBg
                                : existingBoundaryHalf
                                    ? const Color(0xFFEAF6EE)
                                    : baseBg,
                shape: BoxShape.circle,
                boxShadow: hasPendingOverlay
                    ? [
                        BoxShadow(
                          color: pendingBg.withValues(
                            alpha: 0.22 + (_pendingGlowController.value * 0.20),
                          ),
                          blurRadius: 10 + (_pendingGlowController.value * 8),
                          spreadRadius:
                              0.5 + (_pendingGlowController.value * 1.2),
                        ),
                      ]
                    : hasReservationOverlay
                        ? [
                            BoxShadow(
                              color: reservationBg.withValues(
                                alpha: 0.24 +
                                    (_pendingGlowController.value * 0.20),
                              ),
                              blurRadius:
                                  11 + (_pendingGlowController.value * 8),
                              spreadRadius:
                                  0.7 + (_pendingGlowController.value * 1.2),
                            ),
                          ]
                        : null,
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (isBoundaryHalf)
                    ClipPath(
                      clipper: _HalfCircleClipper(
                        showRightHalf: isStart && !isEnd,
                      ),
                      child: Container(
                        decoration: BoxDecoration(
                          color: rangeBg,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                  if (existingBoundaryHalf)
                    ClipPath(
                      clipper: _HalfCircleClipper(
                        showRightHalf:
                            existingBlockedStart && !existingBlockedEnd,
                      ),
                      child: Container(
                        decoration: const BoxDecoration(
                          color: Color(0xFFE77777),
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                  if (hasPendingOverlay &&
                      !pendingVisual.isSingleDay &&
                      (pendingVisual.isStart != pendingVisual.isEnd))
                    ClipPath(
                      clipper: _HalfCircleClipper(
                        showRightHalf:
                            pendingVisual.isStart && !pendingVisual.isEnd,
                      ),
                      child: AnimatedBuilder(
                        animation: _pendingGlowController,
                        builder: (context, child) => Container(
                          decoration: BoxDecoration(
                            color: pendingBg,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: pendingBg.withValues(
                                  alpha: 0.30 +
                                      (_pendingGlowController.value * 0.18),
                                ),
                                blurRadius:
                                    12 + (_pendingGlowController.value * 8),
                                spreadRadius:
                                    0.8 + (_pendingGlowController.value * 1.3),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  if (hasConfirmedReservationOverlay &&
                      !confirmedReservationVisual.isSingleDay &&
                      (confirmedReservationVisual.isStart !=
                          confirmedReservationVisual.isEnd))
                    ClipPath(
                      clipper: _HalfCircleClipper(
                        showRightHalf: confirmedReservationVisual.isStart &&
                            !confirmedReservationVisual.isEnd,
                      ),
                      child: Container(
                        decoration: const BoxDecoration(
                          color: Color(0xFFE77777),
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                  if (hasReservationOverlay &&
                      !reservationVisual.isSingleDay &&
                      (reservationVisual.isStart != reservationVisual.isEnd))
                    ClipPath(
                      clipper: _HalfCircleClipper(
                        showRightHalf: reservationVisual.isStart &&
                            !reservationVisual.isEnd,
                      ),
                      child: AnimatedBuilder(
                        animation: _pendingGlowController,
                        builder: (context, child) => Container(
                          decoration: BoxDecoration(
                            color: reservationBg,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: reservationBg.withValues(
                                  alpha: 0.32 +
                                      (_pendingGlowController.value * 0.18),
                                ),
                                blurRadius:
                                    12 + (_pendingGlowController.value * 8),
                                spreadRadius:
                                    0.8 + (_pendingGlowController.value * 1.3),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  Center(
                    child: Text(
                      '${day.day}',
                      style: TextStyle(
                        color: textColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _resolveCoverUrl() {
    final candidates = [
      widget.house.raw['cover_media_url'],
      widget.house.raw['photo_url'],
      widget.house.raw['image_url'],
      widget.house.raw['cover_url'],
      widget.house.raw['media_url'],
    ];

    for (final candidate in candidates) {
      final value = (candidate ?? '').toString().trim();
      if (value.isEmpty) continue;
      if (value.startsWith('http://') || value.startsWith('https://')) {
        return value;
      }
      if (value.startsWith('/')) {
        final base = AppConfig.dwiraApiBaseUrl.replaceAll(RegExp(r'/+$'), '');
        return '$base$value';
      }
      return value;
    }

    return '';
  }

  List<_GalleryEntry> _buildFallbackGalleryEntries() {
    final base64Value = (widget.house.photoBase64 ?? '').trim();
    final coverUrl = _resolveCoverUrl();

    if (base64Value.isNotEmpty) {
      try {
        final normalized = base64Value.contains(',')
            ? base64Value.split(',').last
            : base64Value;
        final bytes = base64Decode(normalized);
        return <_GalleryEntry>[_GalleryEntry.memory(bytes)];
      } catch (_) {
        // fallback below
      }
    }

    if (coverUrl.isNotEmpty) {
      return <_GalleryEntry>[_GalleryEntry.network(coverUrl)];
    }

    return const <_GalleryEntry>[];
  }

  List<_GalleryEntry> _buildGalleryEntries(
    List<Map<String, dynamic>> rows,
    List<_GalleryEntry> fallbackEntries,
  ) {
    final seenUrls = <String>{};
    final entries = <_GalleryEntry>[];

    for (final row in rows) {
      final type = (row['type'] ?? 'image').toString().trim().toLowerCase();
      if (type == 'video') continue;
      final url = _resolveMediaUrl((row['url'] ?? '').toString());
      if (url.isEmpty || !seenUrls.add(url)) continue;
      entries.add(_GalleryEntry.network(url));
    }

    if (entries.isEmpty) {
      return fallbackEntries;
    }

    for (final fallback in fallbackEntries) {
      if (fallback.url != null &&
          fallback.url!.isNotEmpty &&
          seenUrls.add(fallback.url!)) {
        entries.insert(0, fallback);
      } else if (fallback.memoryBytes != null) {
        entries.insert(0, fallback);
      }
    }

    return entries;
  }

  Future<void> _precacheGallery(List<_GalleryEntry> entries) async {
    for (final entry in entries) {
      if (!mounted) return;
      if (entry.memoryBytes != null) continue;
      final url = entry.url;
      if (url == null || url.isEmpty) continue;
      try {
        await precacheImage(CachedNetworkImageProvider(url), context);
      } catch (_) {
        // Ignore cache warm-up failures, visible rendering handles fallback.
      }
    }
  }

  String _resolveMediaUrl(String rawUrl) {
    final value = rawUrl.trim();
    if (value.isEmpty) return '';
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    if (value.startsWith('/')) {
      final base = AppConfig.dwiraApiBaseUrl.replaceAll(RegExp(r'/+$'), '');
      return '$base$value';
    }
    return value;
  }

  Widget _heroImage() {
    if (_galleryLoading && _galleryEntries.isEmpty) {
      return Container(
        color: const Color(0xFFE6EDF2),
        alignment: Alignment.center,
        child: const CircularProgressIndicator(color: Color(0xFF2F7D4B)),
      );
    }

    if (_galleryEntries.isEmpty) {
      return _heroPlaceholder();
    }

    final safeIndex =
        _selectedGalleryIndex.clamp(0, _galleryEntries.length - 1);
    final entry = _galleryEntries[safeIndex];
    return AppCachedImage(
      imageUrl: entry.url ?? '',
      memoryBytes: entry.memoryBytes,
      fit: BoxFit.cover,
      placeholder: _heroPlaceholder(),
      errorWidget: _heroPlaceholder(),
    );
  }

  Widget _galleryStrip() {
    if (_galleryEntries.length <= 1) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      height: 88,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _galleryEntries.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final entry = _galleryEntries[index];
          final selected = index == _selectedGalleryIndex;
          return GestureDetector(
            onTap: () {
              setState(() {
                _selectedGalleryIndex = index;
              });
            },
            child: Container(
              width: 104,
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: selected
                      ? const Color(0xFF2F7D4B)
                      : const Color(0xFFD7DEE8),
                  width: selected ? 2 : 1,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: AppCachedImage(
                  imageUrl: entry.url ?? '',
                  memoryBytes: entry.memoryBytes,
                  fit: BoxFit.cover,
                  placeholder: _heroPlaceholder(),
                  errorWidget: _heroPlaceholder(),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _heroPlaceholder() {
    return Container(
      color: const Color(0xFFE6EDF2),
      alignment: Alignment.center,
      child: const Icon(
        Icons.home_work_outlined,
        size: 84,
        color: Color(0xFF2F7D4B),
      ),
    );
  }

  Widget _metaChip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: const Color(0xFF475569)),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: Color(0xFF334155),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
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
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 16,
            offset: Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 18,
              color: Color(0xFF0F5132),
            ),
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }

  Widget _glassCircleButton({
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
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: const Color(0x99FFFFFF),
                  width: 1.1,
                ),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x26000000),
                    blurRadius: 12,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              alignment: Alignment.center,
              child: Icon(
                icon,
                size: 22,
                color: const Color(0xFF0F172A),
              ),
            ),
          ),
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

  Widget _calendarModeToggle() {
    return Container(
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F8F4),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFB8D7C3)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: _calendarModePill(
              mode: _CalendarChangeMode.close,
              icon: Icons.event_busy_rounded,
              activeIcon: Icons.check_rounded,
              activeColor: const Color(0xFF16C7BE),
              textColor: const Color(0xFF064E3B),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: _calendarModePill(
              mode: _CalendarChangeMode.open,
              icon: Icons.lock_open_rounded,
              activeIcon: Icons.auto_awesome_rounded,
              activeColor: const Color(0xFFEAF8EF),
              textColor: const Color(0xFF166534),
            ),
          ),
        ],
      ),
    );
  }

  Widget _calendarModePill({
    required _CalendarChangeMode mode,
    required IconData icon,
    required IconData activeIcon,
    required Color activeColor,
    required Color textColor,
  }) {
    final selected = _changeMode == mode;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () {
          if (_changeMode == mode) return;
          setState(() {
            _changeMode = mode;
            _start = null;
            _end = null;
          });
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? activeColor : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected
                  ? (mode == _CalendarChangeMode.close
                      ? const Color(0xFF14B8A6)
                      : const Color(0xFFA7D7B3))
                  : const Color(0xFFD6E7DA),
              width: selected ? 1.6 : 1,
            ),
            boxShadow: selected
                ? const [
                    BoxShadow(
                      color: Color(0x16000000),
                      blurRadius: 10,
                      offset: Offset(0, 4),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: selected
                      ? Colors.white.withValues(alpha: 0.72)
                      : const Color(0xFFF3F4F6),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Icon(
                  selected ? activeIcon : icon,
                  size: 17,
                  color: textColor,
                ),
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  t(mode == _CalendarChangeMode.close
                      ? 'close_period'
                      : 'open_period'),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: textColor,
                    fontSize: 15,
                    height: 1.1,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final modeHelp = _changeMode == _CalendarChangeMode.close
        ? t('owner_calendar_help_close')
        : t('owner_calendar_help_open');

    return ValueListenableBuilder<UiLanguage>(
      valueListenable: UiLanguageService.current,
      builder: (context, language, _) => Directionality(
        textDirection: UiLanguageService.direction(language),
        child: Scaffold(
          backgroundColor: const Color(0xFFF3F0F6),
          body: RefreshIndicator(
            onRefresh: _reloadDetails,
            child: ListView(
              children: [
                SizedBox(
                  height: 320,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _heroImage(),
                      Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Color(0x30000000), Color(0xCC111827)],
                          ),
                        ),
                      ),
                      Positioned(
                        top: MediaQuery.of(context).padding.top + 4,
                        left: 12,
                        child: _glassCircleButton(
                          icon: Icons.arrow_back,
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ),
                      Positioned(
                        top: MediaQuery.of(context).padding.top + 4,
                        right: 12,
                        child: _glassCircleButton(
                          icon: Icons.refresh,
                          onPressed: () {
                            _reloadDetails();
                          },
                        ),
                      ),
                      Positioned(
                        left: 16,
                        right: 16,
                        bottom: 34,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFFDCFCE7),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                t('owner_badge').toUpperCase(),
                                style: TextStyle(
                                  color: Color(0xFF166534),
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1.0,
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '${_galleryEntries.length} photo${_galleryEntries.length > 1 ? 's' : ''}',
                              style: const TextStyle(
                                color: Color(0xFFE5E7EB),
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              widget.house.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 32,
                                height: 1.05,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                          ],
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
                      borderRadius:
                          BorderRadius.vertical(top: Radius.circular(28)),
                    ),
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 26),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: [
                            _metaChip(
                              Icons.verified_user_outlined,
                              widget.house.hasPending
                                  ? t('pending_validation')
                                  : t('up_to_date'),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        _galleryStrip(),
                        const SizedBox(height: 14),
                        _sectionCard(
                          title: t('owner_calendar'),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                modeHelp,
                                style: const TextStyle(
                                  color: Color(0xFF6B7280),
                                  height: 1.35,
                                ),
                              ),
                              const SizedBox(height: 12),
                              _calendarModeToggle(),
                              const SizedBox(height: 12),
                              TableCalendar(
                                firstDay: DateTime.utc(2024, 1, 1),
                                lastDay: DateTime.utc(2031, 12, 31),
                                focusedDay: _focusedDay,
                                availableGestures: AvailableGestures.none,
                                locale: UiLanguageService.localeName(language),
                                availableCalendarFormats: const {
                                  CalendarFormat.month: 'Month',
                                },
                                headerStyle: HeaderStyle(
                                  formatButtonVisible: false,
                                  titleCentered: true,
                                  leftChevronIcon:
                                      _glassChevron(Icons.chevron_left),
                                  rightChevronIcon:
                                      _glassChevron(Icons.chevron_right),
                                  titleTextStyle: TextStyle(
                                    color: Color(0xFF2F7D4B),
                                    fontSize: 31,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                daysOfWeekStyle: const DaysOfWeekStyle(
                                  weekdayStyle:
                                      TextStyle(color: Color(0xFF6B7280)),
                                  weekendStyle:
                                      TextStyle(color: Color(0xFF6B7280)),
                                ),
                                selectedDayPredicate: _isInSelectedRange,
                                onDaySelected: _onDaySelected,
                                calendarBuilders: CalendarBuilders(
                                  defaultBuilder: (context, day, focusedDay) =>
                                      _buildDay(day),
                                  todayBuilder: (context, day, focusedDay) =>
                                      _buildDay(day),
                                  selectedBuilder: (context, day, focusedDay) =>
                                      _buildDay(day),
                                ),
                                onPageChanged: (focusedDay) {
                                  setState(() => _focusedDay = focusedDay);
                                },
                              ),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 14,
                                runSpacing: 8,
                                children: [
                                  _LegendDot(
                                      color: Color(0xFFEAF6EE),
                                      label: t('available')),
                                  _LegendDot(
                                      color: Color(0xFFEFA2A2),
                                      label: t('unavailable')),
                                  if (_pendingCalendarRequests.isNotEmpty)
                                    _LegendDot(
                                      color: const Color(0xFF60A5FA),
                                      label: t('calendar_pending_admin'),
                                    ),
                                  if (_activeReservationStatus() != null)
                                    _LegendDot(
                                      color: const Color(0xFFFACC15),
                                      label: t('reservation_tracking_title'),
                                    ),
                                ],
                              ),
                              _reservationStatusCard(),
                              _pendingRequestCard(),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        _sectionCard(
                          title: t('owner_note'),
                          child: TextField(
                            controller: _noteController,
                            maxLines: 4,
                            decoration: InputDecoration(
                              hintText: 'Note optionnelle pour l admin',
                              filled: true,
                              fillColor: const Color(0xFFF8FAFC),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide:
                                    const BorderSide(color: Color(0xFFE2E8F0)),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide:
                                    const BorderSide(color: Color(0xFFD5DEE8)),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: const BorderSide(
                                    color: Color(0xFF2F7D4B), width: 1.6),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton.icon(
                            onPressed: _submitting ? null : _submitForApproval,
                            icon: _submitting
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : Icon(
                                    _changeMode == _CalendarChangeMode.close
                                        ? Icons.block
                                        : Icons.lock_open,
                                  ),
                            label: Text(
                              _changeMode == _CalendarChangeMode.close
                                  ? t('submit_close')
                                  : t('submit_open'),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF2F7D4B),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HalfCircleClipper extends CustomClipper<Path> {
  const _HalfCircleClipper({required this.showRightHalf});

  final bool showRightHalf;

  @override
  Path getClip(Size size) {
    final path = Path();
    if (showRightHalf) {
      path.addRect(
        Rect.fromLTWH(size.width / 2, 0, size.width / 2, size.height),
      );
    } else {
      path.addRect(Rect.fromLTWH(0, 0, size.width / 2, size.height));
    }
    return path;
  }

  @override
  bool shouldReclip(covariant _HalfCircleClipper oldClipper) {
    return oldClipper.showRightHalf != showRightHalf;
  }
}

enum _CalendarChangeMode { close, open }

class _PendingRangeVisual {
  final bool active;
  final String requestType;
  final bool isSingleDay;
  final bool isStart;
  final bool isEnd;
  final bool isMiddle;

  const _PendingRangeVisual({
    required this.active,
    required this.requestType,
    required this.isSingleDay,
    required this.isStart,
    required this.isEnd,
    required this.isMiddle,
  });

  const _PendingRangeVisual.inactive()
      : active = false,
        requestType = 'close',
        isSingleDay = false,
        isStart = false,
        isEnd = false,
        isMiddle = false;
}

class _ReservationRangeVisual {
  final bool active;
  final bool isSingleDay;
  final bool isStart;
  final bool isEnd;
  final bool isMiddle;

  const _ReservationRangeVisual({
    required this.active,
    required this.isSingleDay,
    required this.isStart,
    required this.isEnd,
    required this.isMiddle,
  });

  const _ReservationRangeVisual.inactive()
      : active = false,
        isSingleDay = false,
        isStart = false,
        isEnd = false,
        isMiddle = false;
}

class _GalleryEntry {
  final String? url;
  final Uint8List? memoryBytes;

  const _GalleryEntry.network(String this.url) : memoryBytes = null;
  const _GalleryEntry.memory(this.memoryBytes) : url = null;
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String label;

  const _LegendDot({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: Color(0xFF334155),
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
