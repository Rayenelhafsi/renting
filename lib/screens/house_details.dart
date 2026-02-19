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

  bool _isSameDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  Widget _buildCalendarCell(DateTime day) {
    final dateStr = DateFormat('yyyy-MM-dd').format(day);
    final isAvailable = _updatedAvailability.contains(dateStr);
    // final isCleaning = _updatedCleaningSchedule.contains(dateStr);

    return Container(
      margin: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: isAvailable
            ? Colors.green[200]
            : Colors.grey[300], // Unavailable dates shown in grey
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        '${day.day}',
        style: TextStyle(
          color: isAvailable ? Colors.green[800] : Colors.grey[600],
        ),
      ),
    );
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.house['name'] ?? 'No Name'),
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Photo carousel or upload button
            Container(
              height: 250,
              color: Colors.white,
              child: Stack(
                children: [
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
                      } catch (e) {
                        return const Center(child: Icon(Icons.broken_image));
                      }
                    },
                  ),
                  Positioned(
                    right: 8,
                    bottom: 8,
                    child: ElevatedButton.icon(
                      onPressed: _uploadPhoto,
                      icon: const Icon(Icons.upload),
                      label: const Text('Upload Photos'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // Price display
            if (price != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '\$${price!.toStringAsFixed(2)} / month',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: Colors.green,
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 8),
            // Book button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: ElevatedButton(
                onPressed: () {
                  // Navigate to calendar or booking screen (reuse current calendar UI)
                  showModalBottomSheet(
                    context: context,
                    builder: (_) => SizedBox(
                      height: 400,
                      child: TableCalendar(
                        focusedDay: _focusedDay,
                        firstDay: DateTime.utc(2024),
                        lastDay: DateTime.utc(2030),
                        calendarFormat: CalendarFormat.month,
                        availableCalendarFormats: const {
                          CalendarFormat.month: 'Month',
                        },
                        calendarStyle: const CalendarStyle(
                          todayDecoration: BoxDecoration(
                            color: Colors.green,
                            shape: BoxShape.circle,
                          ),
                        ),
                        calendarBuilders: CalendarBuilders(
                          defaultBuilder: (context, day, _) =>
                              _buildCalendarCell(day),
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
                  );
                },
                child: const Text('Book The Apartment'),
              ),
            ),
            const SizedBox(height: 8),
            // Note-taking area
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Notes',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  TextField(
                    controller: noteController,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      hintText: 'Enter your notes here',
                    ),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton(
                    onPressed: _saveNote,
                    child: const Text('Save Note'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            // Existing calendar availability UI
            SizedBox(
              height: 400,
              child: TableCalendar(
                focusedDay: _focusedDay,
                firstDay: DateTime.utc(2024),
                lastDay: DateTime.utc(2030),
                calendarFormat: CalendarFormat.month,
                availableCalendarFormats: const {
                  CalendarFormat.month: 'Month',
                },
                calendarStyle: const CalendarStyle(
                  todayDecoration: BoxDecoration(
                    color: Colors.green,
                    shape: BoxShape.circle,
                  ),
                ),
                calendarBuilders: CalendarBuilders(
                  defaultBuilder: (context, day, _) => _buildCalendarCell(day),
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
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: ElevatedButton(
                onPressed: (_isLoadingRole || _userRole == null)
                    ? null
                    : _confirmChanges,
                child: _isLoadingRole
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Confirm Availability Changes'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
