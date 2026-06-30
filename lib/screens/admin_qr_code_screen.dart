import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'login_screen.dart';

class AdminQRCodeScreen extends StatefulWidget {
  const AdminQRCodeScreen({super.key});

  @override
  State<AdminQRCodeScreen> createState() => _AdminQRCodeScreenState();
}

class _AdminQRCodeScreenState extends State<AdminQRCodeScreen> {
  String? selectedOwnerId;
  List<Map<String, dynamic>> owners = [];

  @override
  void initState() {
    super.initState();
    _fetchOwners();
  }

  Future<void> _fetchOwners() async {
    final usersSnapshot = await FirebaseFirestore.instance
        .collection('users')
        .where('role', isEqualTo: 'owner')
        .get();

    setState(() {
      owners = usersSnapshot.docs
          .map((doc) => {'id': doc.id, 'email': doc['email']})
          .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Generate Owner QR Code'),
        actions: [
          IconButton(
            icon: const Icon(Icons.exit_to_app),
            tooltip: 'Logout',
            onPressed: () async {
              await FirebaseAuth.instance.signOut();
              if (mounted) {
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                  (route) => false,
                );
              }
            },
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(
                labelText: 'Select Owner',
                border: OutlineInputBorder(),
              ),
              items: owners
                  .map((owner) => DropdownMenuItem<String>(
                        value: owner['id'],
                        child: Text(owner['email']),
                      ))
                  .toList(),
              initialValue: selectedOwnerId,
              onChanged: (value) {
                setState(() {
                  selectedOwnerId = value;
                });
              },
            ),
            const SizedBox(height: 20),
            if (selectedOwnerId != null)
              SizedBox(
                width: 200,
                height: 200,
                child: QrImageView(
                  data: selectedOwnerId!,
                  size: 200,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
