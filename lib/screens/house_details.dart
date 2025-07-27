import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:intl/intl.dart';

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

  @override
  void initState() {
    super.initState();
    availableDates = _parseDates(widget.house['availability']);
    cleaningDates = _parseDates(widget.house['cleaningSchedule']);

    _updatedAvailability = widget.house['availability'].cast<String>().toSet();
    _updatedCleaningSchedule =
        widget.house['cleaningSchedule'].cast<String>().toSet();
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
            : isCleaning
                ? Colors.blue[200]
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
    final ref =
        FirebaseFirestore.instance.collection('houses').doc(widget.house.id);
    try {
      await ref.update({
        'availability': _updatedAvailability.toList(),
        'cleaningSchedule': _updatedCleaningSchedule.toList(),
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Availability updated successfully')),
      );
      setState(() {
        availableDates =
            _updatedAvailability.map((d) => DateTime.parse(d)).toList();
        cleaningDates =
            _updatedCleaningSchedule.map((d) => DateTime.parse(d)).toList();
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to update availability: $e')),
      );
    }
  }

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
              focusedDay: DateTime.now(),
              firstDay: DateTime.utc(2024),
              lastDay: DateTime.utc(2030),
              calendarFormat: CalendarFormat.month,
              calendarStyle: const CalendarStyle(
                todayDecoration: BoxDecoration(
                  color: Colors.orange,
                  shape: BoxShape.circle,
                ),
              ),
              calendarBuilders: CalendarBuilders(
                defaultBuilder: (context, day, _) => _buildCalendarCell(day),
              ),
              onDaySelected: (selectedDay, _) =>
                  _showDayOptions(context, selectedDay),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: ElevatedButton(
              onPressed: _confirmChanges,
              child: const Text('Confirm Availability Changes'),
            ),
          ),
        ],
      ),
    );
  }
}
