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

  @override
  void initState() {
    super.initState();
    availableDates = _parseDates(widget.house['availability']);
    cleaningDates = _parseDates(widget.house['cleaningSchedule']);
  }

  List<DateTime> _parseDates(List<dynamic> dates) {
    return dates.map((d) => DateTime.parse(d)).toList();
  }

  bool _isSameDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

  void _toggleDate(List<DateTime> list, String field, DateTime date) async {
    final dateStr = DateFormat('yyyy-MM-dd').format(date);
    final ref = FirebaseFirestore.instance.collection('houses').doc(widget.house.id);

    final isInList = widget.house[field].contains(dateStr);

    await ref.update({
      field: isInList
          ? FieldValue.arrayRemove([dateStr])
          : FieldValue.arrayUnion([dateStr]),
    });

    setState(() {
      if (isInList) {
        list.removeWhere((d) => _isSameDay(d, date));
      } else {
        list.add(date);
      }
    });
  }

  Widget _buildCalendarCell(DateTime day) {
    final isAvailable = availableDates.any((d) => _isSameDay(d, day));
    final isCleaning = cleaningDates.any((d) => _isSameDay(d, day));

    return Container(
      margin: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: isAvailable
            ? Colors.green[300]
            : isCleaning
                ? Colors.blue[200]
                : Colors.grey[200],
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
            Text('Selected Day: $dateStr', style: const TextStyle(fontSize: 16)),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                _toggleDate(availableDates, 'availability', date);
              },
              child: const Text('Toggle Availability'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                _toggleDate(cleaningDates, 'cleaningSchedule', date);
              },
              child: const Text('Toggle Cleaning Schedule'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.house['name']),
      ),
      body: TableCalendar(
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
        onDaySelected: (selectedDay, _) => _showDayOptions(context, selectedDay),
      ),
    );
  }
}
