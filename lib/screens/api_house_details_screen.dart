import 'dart:convert';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';

import '../config/app_config.dart';
import '../models/owner_house.dart';
import '../services/dwira_api_service.dart';
import '../services/ui_language_service.dart';

class ApiHouseDetailsScreen extends StatefulWidget {
  final OwnerHouse house;
  final String ownerId;

  const ApiHouseDetailsScreen({
    super.key,
    required this.house,
    required this.ownerId,
  });

  @override
  State<ApiHouseDetailsScreen> createState() => _ApiHouseDetailsScreenState();
}

class _ApiHouseDetailsScreenState extends State<ApiHouseDetailsScreen> {
  final DwiraApiService _api = DwiraApiService.instance;
  DateTime _focusedDay = DateTime.now();
  DateTime? _start;
  DateTime? _end;
  bool _submitting = false;
  final TextEditingController _noteController = TextEditingController();

  Set<String> _blockedDays = <String>{};
  _CalendarChangeMode _changeMode = _CalendarChangeMode.close;
  String t(String key) => UiLanguageService.t(key);

  @override
  void initState() {
    super.initState();
    _loadCalendar();
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _loadCalendar() async {
    try {
      final rows = await _api.fetchUnavailableDates(widget.house.id);
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
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Chargement calendrier impossible: $e')),
      );
    }
  }

  void _onDaySelected(DateTime selectedDay, DateTime focusedDay) {
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
    final inRange = _isInSelectedRange(day);

    Color bg;
    Color fg;
    if (inRange) {
      bg = _changeMode == _CalendarChangeMode.close
          ? const Color(0xFFE77777)
          : const Color(0xFF2F7D4B);
      fg = Colors.white;
    } else if (blocked) {
      bg = const Color(0xFFEFA2A2);
      fg = Colors.white;
    } else {
      bg = const Color(0xFFEAF6EE);
      fg = const Color(0xFF2F7D4B);
    }

    return Center(
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: bg,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Text(
          '${day.day}',
          style: TextStyle(
            color: fg,
            fontWeight: FontWeight.w600,
          ),
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

  Widget _heroImage() {
    final base64Value = (widget.house.photoBase64 ?? '').trim();
    final coverUrl = _resolveCoverUrl();

    if (base64Value.isNotEmpty) {
      try {
        final normalized = base64Value.contains(',')
            ? base64Value.split(',').last
            : base64Value;
        final bytes = base64Decode(normalized);
        return Image.memory(
          bytes,
          fit: BoxFit.cover,
          gaplessPlayback: true,
        );
      } catch (_) {
        // fallback below
      }
    }

    if (coverUrl.isNotEmpty) {
      return Image.network(
        coverUrl,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _heroPlaceholder(),
      );
    }

    return _heroPlaceholder();
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
            onRefresh: _loadCalendar,
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
                        top: MediaQuery.of(context).padding.top + 10,
                        left: 12,
                        child: _glassCircleButton(
                          icon: Icons.arrow_back,
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ),
                      Positioned(
                        top: MediaQuery.of(context).padding.top + 10,
                        right: 12,
                        child: _glassCircleButton(
                          icon: Icons.refresh,
                          onPressed: _loadCalendar,
                        ),
                      ),
                      Positioned(
                        left: 16,
                        right: 16,
                        bottom: 16,
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
                            _metaChip(Icons.badge_outlined,
                                '${t('id')}: ${widget.house.id}'),
                            _metaChip(
                              Icons.verified_user_outlined,
                              widget.house.hasPending
                                  ? t('pending_validation')
                                  : t('up_to_date'),
                            ),
                          ],
                        ),
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
                              SegmentedButton<_CalendarChangeMode>(
                                style: ButtonStyle(
                                  side: WidgetStateProperty.all(
                                    const BorderSide(color: Color(0xFF2F7D4B)),
                                  ),
                                ),
                                segments: [
                                  ButtonSegment(
                                    value: _CalendarChangeMode.close,
                                    icon: Icon(Icons.check),
                                    label: Text(t('close_period')),
                                  ),
                                  ButtonSegment(
                                    value: _CalendarChangeMode.open,
                                    icon: Icon(Icons.lock_open),
                                    label: Text(t('open_period')),
                                  ),
                                ],
                                selected: {_changeMode},
                                onSelectionChanged: (selection) {
                                  setState(() {
                                    _changeMode = selection.first;
                                    _start = null;
                                    _end = null;
                                  });
                                },
                              ),
                              const SizedBox(height: 12),
                              TableCalendar(
                                firstDay: DateTime.utc(2024, 1, 1),
                                lastDay: DateTime.utc(2031, 12, 31),
                                focusedDay: _focusedDay,
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
                                ],
                              ),
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

enum _CalendarChangeMode { close, open }

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
