import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

class CreateOwnerScreen extends StatefulWidget {
  const CreateOwnerScreen({super.key});

  @override
  State<CreateOwnerScreen> createState() => _CreateOwnerScreenState();
}

class _CreateOwnerScreenState extends State<CreateOwnerScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();

  String? _newOwnerId;
  bool _isLoading = false;

  Future<void> _createOwner() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _newOwnerId = null;
    });

    try {
      // Add owner details to Firestore with auto-generated ID
      final docRef = await FirebaseFirestore.instance.collection('users').add({
        'name': _nameController.text.trim(),
        'phone': _phoneController.text.trim(),
        'role': 'owner',
      });

      setState(() {
        _newOwnerId = docRef.id;
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e')),
      );
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Widget _buildQrCode() {
    if (_newOwnerId == null) return const SizedBox.shrink();

    return Column(
      children: [
        const SizedBox(height: 20),
        const Text('Owner Created! QR Code:', style: TextStyle(fontSize: 16)),
        const SizedBox(height: 10),
        QrImageView(
          data: _newOwnerId!,
          size: 200,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create New Owner'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Form(
              key: _formKey,
              child: Column(
                children: [
                  TextFormField(
                    controller: _nameController,
                    decoration: const InputDecoration(labelText: 'Name'),
                    validator: (value) => value == null || value.isEmpty
                        ? 'Please enter a name'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _phoneController,
                    decoration: const InputDecoration(labelText: 'Phone'),
                    validator: (value) => value == null || value.isEmpty
                        ? 'Please enter a phone number'
                        : null,
                  ),
                  const SizedBox(height: 20),
                  _isLoading
                      ? const CircularProgressIndicator()
                      : ElevatedButton(
                          onPressed: _createOwner,
                          child: const Text('Create Owner'),
                        ),
                ],
              ),
            ),
            _buildQrCode(),
          ],
        ),
      ),
    );
  }
}
