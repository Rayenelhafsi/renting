import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:intl/intl.dart';
import 'package:firebase_auth/firebase_auth.dart';

class HouseDetailsScreen extends StatefulWidget {
  final DocumentSnapshot house;
  const HouseDetailsScreen({super.key, required this.house});

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

  @override
  void initState() {
    super.initState();
    availableDates = _parseDates(widget.house['availability']);
    cleaningDates = _parseDates(widget.house['cleaningSchedule']);

    _updatedAvailability = widget.house['availability'].cast<String>().toSet();
    _updatedCleaningSchedule =
        widget.house['cleaningSchedule'].cast<String>().toSet();

    _fetchUserRole();
  }

  Future<void> reloadData() async {
    final doc = await FirebaseFirestore.instance.collection('houses').doc(widget.house.id).get();
    final data = doc.data();
    if (data != null) {
      setState(() {
        availableDates = _parseDates(data['availability'] ?? []);
        cleaningDates = _parseDates(data['cleaningSchedule'] ?? []);
        _updatedAvailability = (data['availability'] ?? []).cast<String>().toSet();
        _updatedCleaningSchedule = (data['cleaningSchedule'] ?? []).cast<String>().toSet();
      });
    }
  }

  Future<void> _fetchUserRole() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user != null) {
      final userDocSnapshot = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
      final userData = userDocSnapshot.data();
      String? role;
      if (userData != null && userData.containsKey('role')) {
        final dynamic roleField = userData['role'];
        if (roleField is String) {
          role = roleField;
        }
      }
      setState(() {
        _userRole = role;
        _isLoadingRole = false;
      });
    } else {
      setState(() {
        _isLoadingRole = false;
      });
    }
  }

  List<DateTime> _parseDates(List<dynamic> dates) {
    return dates.map((d) => DateTime.parse(d)).toList();
  }

  bool _isSameDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  void _toggleDate(Set<String> set, DateTime date) {
    final dateStr = DateFormat('yyyy-MM-dd').format(date);
    set.contains(dateStr) ? set.remove(dateStr) : set.add(dateStr);
  }

  Widget _buildCalendarCell(DateTime day) {
    final dateStr = DateFormat('yyyy-MM-dd').format(day);
    final isAvailable = _updatedAvailability.contains(dateStr);
    final isCleaning = _updatedCleaningSchedule.contains(dateStr);

    return Container(
      margin: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: isAvailable
            ? Colors.green[300]
                : Colors.red[300], // Unavailable dates shown in red
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text('${day.day}'),
    );
  }

  void _showDayOptions(BuildContext context, DateTime date) {
    final dateStr = DateFormat('yyyy-MM-dd').format(date);
    showModalBottomSheet(
      context: context,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(16),
        child: Wrap(
          runSpacing: 10,
          children: [
            Text('Selected Day: $dateStr',
                style: const TextStyle(fontSize: 16)),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                setState(() {
                  _toggleDate(_updatedAvailability, date);
                });
              },
              child: const Text('Toggle Availability'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                setState(() {
                  _toggleDate(_updatedCleaningSchedule, date);
                });
              },
              child: const Text('Toggle Cleaning Schedule'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmChanges() async {
    if (_userRole == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('User role not determined yet. Please try again.')),
      );
      return;
    }

    final ref =
        FirebaseFirestore.instance.collection('houses').doc(widget.house.id);
    try {
      if (_userRole == 'owner') {
        // Owner: update pending fields
        await ref.update({
          'availabilityPending': _updatedAvailability.toList(),
          'cleaningSchedulePending': _updatedCleaningSchedule.toList(),
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Availability changes submitted for approval')),
        );
      } else if (_userRole == 'admin') {
        // Admin: update main fields directly
        await ref.update({
          'availability': _updatedAvailability.toList(),
          'cleaningSchedule': _updatedCleaningSchedule.toList(),
        });
        setState(() {
          availableDates = _parseDates(_updatedAvailability.toList());
          cleaningDates = _parseDates(_updatedCleaningSchedule.toList());
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Availability changes updated successfully')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('User role not authorized to confirm changes')),
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
        title: Text(widget.house['name']),
      ),
      body: Column(
        children: [
          Expanded(
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
                  color: Colors.orange,
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
            onPressed: (_isLoadingRole || _userRole == null) ? null : _confirmChanges,
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
    );
  }
}
