import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:intl/intl.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'dart:convert';
import 'package:image_picker/image_picker.dart';

class HouseDetailsScreen extends StatefulWidget {
  final DocumentSnapshot house;
  final String? ownerId;
  const HouseDetailsScreen({super.key, required this.house, this.ownerId});

  @override
  State<HouseDetailsScreen> createState() => _HouseDetailsScreenState();
}

class _HouseDetailsScreenState extends State<HouseDetailsScreen> {
  late List<DateTime> availableDates;
  late List<DateTime> cleaningDates;

  // Local copies to track changes before confirmation
  late Set<String> _updatedAvailability;
  late Set<String> _updatedCleaningSchedule;

  String? _userRole;
  bool _isLoadingRole = true;

  // New fields for photos, price, and notes
  List<String> photos = [];
  double? price;
  TextEditingController noteController = TextEditingController();

  // Carousel related
  late PageController _pageController;
  int _currentPage = 0;
  Timer? _carouselTimer;

  @override
  void initState() {
    super.initState();
    availableDates = _parseDates(widget.house['availability']);
    cleaningDates = _parseDates(widget.house['cleaningSchedule']);

    _updatedAvailability = widget.house['availability'].cast<String>().toSet();
    _updatedCleaningSchedule =
        widget.house['cleaningSchedule'].cast<String>().toSet();

    final data = widget.house.data() as Map<String, dynamic>? ?? {};
    photos = List<String>.from(
        data.containsKey('photosBase64') ? data['photosBase64'] : []);
    price = (data.containsKey('price') && data['price'] != null)
        ? (data['price'] as num).toDouble()
        : null;
    noteController.text = data.containsKey('note') ? data['note'] : '';

    _pageController = PageController(initialPage: 0);

    _startCarousel();

    _fetchUserRole();
  }

  void _startCarousel() {
    _carouselTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      if (photos.isNotEmpty && _pageController.hasClients) {
        _currentPage = (_currentPage + 1) % photos.length;
        _pageController.animateToPage(
          _currentPage,
          duration: const Duration(milliseconds: 500),
          curve: Curves.easeInOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _carouselTimer?.cancel();
    _pageController.dispose();
    noteController.dispose();
    super.dispose();
  }

  Future<void> reloadData() async {
    final doc = await FirebaseFirestore.instance
        .collection('houses')
        .doc(widget.house.id)
        .get();
    final data = doc.data() as Map<String, dynamic>? ?? {};
    if (data.isNotEmpty) {
      setState(() {
        availableDates = _parseDates(data['availability'] ?? []);
        cleaningDates = _parseDates(data['cleaningSchedule'] ?? []);
        _updatedAvailability =
            (data['availability'] ?? []).cast<String>().toSet();
        _updatedCleaningSchedule =
            (data['cleaningSchedule'] ?? []).cast<String>().toSet();

        photos = List<String>.from(
            data.containsKey('photosBase64') ? data['photosBase64'] : []);
        price = (data.containsKey('price') && data['price'] != null)
            ? (data['price'] as num).toDouble()
            : null;
        noteController.text = data.containsKey('note') ? data['note'] : '';
      });
    }
  }

  Future<void> _fetchUserRole() async {
    String? role;
    if (widget.ownerId != null) {
      final ownerDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(widget.ownerId)
          .get();
      final ownerData = ownerDoc.data();
      if (ownerData != null && ownerData.containsKey('role')) {
        final roleField = ownerData['role'];
        if (roleField is String) {
          role = roleField;
        }
      }
    } else {
      final user = FirebaseAuth.instance.currentUser;
      if (user != null) {
        final userDocSnapshot = await FirebaseFirestore.instance
            .collection('users')
            .doc(user.uid)
            .get();
        var userData = userDocSnapshot.data();

        if (userData != null && userData.containsKey('role')) {
          final dynamic roleField = userData['role'];
          if (roleField is String) {
            role = roleField;
          }
        }
      }
    }

    setState(() {
      _userRole = role;
      _isLoadingRole = false;
    });
  }

  List<DateTime> _parseDates(List<dynamic> dates) {
    return dates.map((d) => DateTime.parse(d)).toList();
  }

  void _toggleDate(Set<String> set, DateTime date) {
    final dateStr = DateFormat('yyyy-MM-dd').format(date);
    set.contains(dateStr) ? set.remove(dateStr) : set.add(dateStr);
  }

  Future<void> _saveNote() async {
    final ref =
        FirebaseFirestore.instance.collection('houses').doc(widget.house.id);
    try {
      await ref.update({'note': noteController.text});
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Note saved successfully')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to save note: $e')),
      );
    }
  }

  Future<void> _uploadPhoto() async {
    final picker = ImagePicker();
    final pickedFile = await picker.pickImage(source: ImageSource.gallery);
    if (pickedFile == null) return;

    final bytes = await pickedFile.readAsBytes();
    final base64Image = base64Encode(bytes);

    try {
      final ref =
          FirebaseFirestore.instance.collection('houses').doc(widget.house.id);
      photos.add(base64Image);
      await ref.update({'photosBase64': photos});

      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Photo uploaded successfully')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to upload photo: $e')),
      );
    }
  }

  Future<void> _confirmChanges() async {
    if (_userRole == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('User role not determined yet. Please try again.')),
      );
      return;
    }

    final ref =
        FirebaseFirestore.instance.collection('houses').doc(widget.house.id);
    try {
      if (_userRole == 'owner') {
        await ref.update({
          'availabilityPending': _updatedAvailability.toList(),
          'cleaningSchedulePending': _updatedCleaningSchedule.toList(),
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Availability changes submitted for approval')),
        );
      } else if (_userRole == 'admin') {
        await ref.update({
          'availability': _updatedAvailability.toList(),
          'cleaningSchedule': _updatedCleaningSchedule.toList(),
        });
        setState(() {
          availableDates = _parseDates(_updatedAvailability.toList());
          cleaningDates = _parseDates(_updatedCleaningSchedule.toList());
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Availability changes updated successfully')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('User role not authorized to confirm changes')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to submit availability changes: $e')),
      );
    }
  }

  DateTime _focusedDay = DateTime.now();

  String get _houseName {
    final data = widget.house.data() as Map<String, dynamic>? ?? {};
    return (data['name'] ?? data['titre'] ?? 'Bien').toString();
  }

  String get _locationLabel {
    final data = widget.house.data() as Map<String, dynamic>? ?? {};
    return (data['location'] ??
            data['zone_nom'] ??
            data['quartier'] ??
            data['adresse'] ??
            'Kelibia, Nabeul')
        .toString();
  }

  Widget _buildHeroSection(BuildContext context) {
    return SizedBox(
      height: 320,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (photos.isNotEmpty)
            PageView.builder(
              controller: _pageController,
              itemCount: photos.length,
              itemBuilder: (context, index) {
                try {
                  final decodedBytes = base64Decode(photos[index]);
                  return Image.memory(
                    decodedBytes,
                    fit: BoxFit.cover,
                  );
                } catch (_) {
                  return Container(
                    color: const Color(0xFFE8ECF0),
                    child: const Icon(Icons.broken_image, size: 48),
                  );
                }
              },
            )
          else
            Container(
              color: const Color(0xFFE8ECF0),
              child: const Icon(
                Icons.home_work_outlined,
                size: 70,
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
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            child: _circleActionButton(
              icon: Icons.arrow_back,
              onTap: () => Navigator.of(context).pop(),
            ),
          ),
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 12,
            child: Row(
              children: [
                _circleActionButton(icon: Icons.share_outlined, onTap: () {}),
                const SizedBox(width: 8),
                _circleActionButton(icon: Icons.favorite_border, onTap: () {}),
              ],
            ),
          ),
          Positioned(
            right: 14,
            bottom: 14,
            child: ElevatedButton.icon(
              onPressed: _uploadPhoto,
              icon: const Icon(Icons.upload, size: 16),
              label: const Text('UPLOAD PHOTOS'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2F7D4B),
                foregroundColor: Colors.white,
                elevation: 3,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _circleActionButton({
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.36),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
        ),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    );
  }

  Widget _metaChip({
    required IconData icon,
    required String label,
    Color background = const Color(0xFFF4F6F8),
    Color foreground = const Color(0xFF4B5563),
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: foreground),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: foreground,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCalendarDay(DateTime day, DateTime focusedDay) {
    final dateStr = DateFormat('yyyy-MM-dd').format(day);
    final isAvailable = _updatedAvailability.contains(dateStr);
    final isToday = isSameDay(day, DateTime.now());
    final isOutsideMonth = day.month != focusedDay.month;

    Color background;
    Color textColor;

    if (isOutsideMonth) {
      background = Colors.transparent;
      textColor = const Color(0xFFA8A8A8);
    } else if (isAvailable) {
      background = const Color(0xFF2F7D4B);
      textColor = Colors.white;
    } else {
      background = const Color(0xFFE77777);
      textColor = Colors.white;
    }

    return Center(
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: background,
          shape: BoxShape.circle,
          border: isToday
              ? Border.all(color: const Color(0xFF0F5132), width: 2)
              : null,
        ),
        alignment: Alignment.center,
        child: Text(
          '${day.day}',
          style: TextStyle(
            color: textColor,
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF3F0F6),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildHeroSection(context),
            Transform.translate(
              offset: const Offset(0, -22),
              child: Container(
                decoration: const BoxDecoration(
                  color: Color(0xFFF8F8FA),
                  borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
                ),
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        width: 60,
                        height: 5,
                        decoration: BoxDecoration(
                          color: const Color(0xFFD5D7DD),
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE6F6EE),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'SEJOUR PREMIUM',
                        style: TextStyle(
                          color: Color(0xFF2F7D4B),
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.3,
                          fontSize: 11,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _houseName,
                      style: const TextStyle(
                        fontSize: 35,
                        height: 1.05,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        _metaChip(icon: Icons.location_on_outlined, label: _locationLabel),
                        _metaChip(
                          icon: Icons.star_rounded,
                          label: '4.7 (31 avis)',
                          background: const Color(0xFFFDF2DF),
                          foreground: const Color(0xFF9A6700),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () {},
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: const Color(0xFF2F7D4B),
                              elevation: 0,
                              side: const BorderSide(
                                color: Color(0xFFAEE2C8),
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(999),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                            child: const Text(
                              'BOOK THE APARTMENT',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.2,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        ElevatedButton(
                          onPressed:
                              (_isLoadingRole || _userRole == null) ? null : _confirmChanges,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2F7D4B),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(999),
                            ),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 14,
                            ),
                          ),
                          child: _isLoadingRole
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(Icons.check),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(color: const Color(0xFFE9ECF1)),
                      ),
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'NOTES',
                            style: TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF0F5132),
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextField(
                            controller: noteController,
                            maxLines: 5,
                            decoration: InputDecoration(
                              hintText: 'Ecrivez vos notes ici',
                              filled: true,
                              fillColor: const Color(0xFFF8FAFC),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: const BorderSide(
                                  color: Color(0xFFD8E4DC),
                                ),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: const BorderSide(
                                  color: Color(0xFFD8E4DC),
                                ),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: const BorderSide(
                                  color: Color(0xFF2F7D4B),
                                  width: 1.5,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: ElevatedButton(
                              onPressed: _saveNote,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.white,
                                foregroundColor: const Color(0xFF2F7D4B),
                                elevation: 0,
                                side: const BorderSide(color: Color(0xFFAEE2C8)),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(999),
                                ),
                              ),
                              child: const Text('SAVE NOTE'),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(color: const Color(0xFFE9ECF1)),
                      ),
                      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                      child: TableCalendar(
                        focusedDay: _focusedDay,
                        firstDay: DateTime.utc(2024),
                        lastDay: DateTime.utc(2030),
                        calendarFormat: CalendarFormat.month,
                        availableCalendarFormats: const {
                          CalendarFormat.month: 'Month',
                        },
                        locale: 'en_US',
                        headerStyle: const HeaderStyle(
                          titleCentered: true,
                          formatButtonVisible: false,
                          titleTextStyle: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w500,
                            color: Color(0xFF285D3A),
                            letterSpacing: 0.4,
                          ),
                          leftChevronIcon: Icon(
                            Icons.chevron_left,
                            color: Color(0xFF111827),
                            size: 28,
                          ),
                          rightChevronIcon: Icon(
                            Icons.chevron_right,
                            color: Color(0xFF111827),
                            size: 28,
                          ),
                        ),
                        daysOfWeekStyle: const DaysOfWeekStyle(
                          weekdayStyle: TextStyle(
                            color: Color(0xFF8E8E8E),
                            fontWeight: FontWeight.w500,
                          ),
                          weekendStyle: TextStyle(
                            color: Color(0xFF8E8E8E),
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        calendarBuilders: CalendarBuilders(
                          defaultBuilder: (context, day, focusedDay) =>
                              _buildCalendarDay(day, focusedDay),
                          todayBuilder: (context, day, focusedDay) =>
                              _buildCalendarDay(day, focusedDay),
                          outsideBuilder: (context, day, focusedDay) =>
                              _buildCalendarDay(day, focusedDay),
                        ),
                        selectedDayPredicate: (day) =>
                            _updatedAvailability.contains(
                              DateFormat('yyyy-MM-dd').format(day),
                            ),
                        onDaySelected: (selectedDay, _) {
                          setState(() {
                            _toggleDate(_updatedAvailability, selectedDay);
                          });
                        },
                        onPageChanged: (focusedDay) {
                          setState(() {
                            _focusedDay = focusedDay;
                          });
                        },
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 12,
                      runSpacing: 8,
                      children: const [
                        _CalendarLegend(
                          color: Color(0xFF2F7D4B),
                          label: 'Disponible',
                        ),
                        _CalendarLegend(
                          color: Color(0xFFE77777),
                          label: 'Reserve / indisponible',
                        ),
                      ],
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
}

class _CalendarLegend extends StatelessWidget {
  final Color color;
  final String label;

  const _CalendarLegend({required this.color, required this.label});

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
            color: Color(0xFF4B5563),
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
