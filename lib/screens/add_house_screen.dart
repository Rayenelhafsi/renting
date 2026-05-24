import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../config/app_config.dart';
import '../services/dwira_api_service.dart';

class AddHouseScreen extends StatefulWidget {
  final String? ownerId;
  const AddHouseScreen({super.key, this.ownerId});

  @override
  State<AddHouseScreen> createState() => _AddHouseScreenState();
}

class _AddHouseScreenState extends State<AddHouseScreen> {
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _ownerMobileNameController =
      TextEditingController();
  bool isLoading = false;

  Future<void> _addHouse() async {
    final houseName = _nameController.text.trim();
    if (houseName.isEmpty) return;

    setState(() => isLoading = true);
    try {
      final ownerId = widget.ownerId ?? FirebaseAuth.instance.currentUser?.uid;
      if (ownerId == null || ownerId.trim().isEmpty) {
        throw Exception('ownerId introuvable');
      }

      if (AppConfig.useDwiraApi) {
        await DwiraApiService.instance.createBienAdmin(
          titre: houseName,
          proprietaireId: ownerId,
          nomBienMobile: _ownerMobileNameController.text.trim(),
        );
      } else {
        await FirebaseFirestore.instance.collection('houses').add({
          'name': houseName,
          'ownerId': ownerId,
          'availability': [],
          'cleaningSchedule': [],
        });
      }

      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString()}')),
      );
    } finally {
      setState(() => isLoading = false);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _ownerMobileNameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add New House')),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          children: [
            const Text('Enter House Name', style: TextStyle(fontSize: 20)),
            const SizedBox(height: 20),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'House Name',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _ownerMobileNameController,
              decoration: const InputDecoration(
                labelText: 'Nom bien mobile proprietaire',
                helperText:
                    'Nom affiche uniquement dans l application mobile proprietaire.',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),
            isLoading
                ? const CircularProgressIndicator()
                : ElevatedButton(
                    onPressed: _addHouse,
                    child: const Text('Add House'),
                  ),
          ],
        ),
      ),
    );
  }
}
