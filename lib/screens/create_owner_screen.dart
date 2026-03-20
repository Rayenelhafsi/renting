import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../config/app_config.dart';
import '../services/dwira_api_service.dart';

class CreateOwnerScreen extends StatefulWidget {
  const CreateOwnerScreen({super.key});

  @override
  State<CreateOwnerScreen> createState() => _CreateOwnerScreenState();
}

class _CreateOwnerScreenState extends State<CreateOwnerScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _cinController = TextEditingController();

  String? _newOwnerId;
  bool _isLoading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _cinController.dispose();
    super.dispose();
  }

  Future<void> _createOwner() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _newOwnerId = null;
    });

    try {
      if (AppConfig.useDwiraApi) {
        final created = await DwiraApiService.instance.createProprietaireAdmin(
          nom: _nameController.text,
          telephone: _phoneController.text,
          email: _emailController.text,
          cin: _cinController.text,
        );
        setState(() {
          _newOwnerId = (created['id'] ?? '').toString();
        });
      } else {
        final docRef = await FirebaseFirestore.instance.collection('users').add({
          'name': _nameController.text.trim(),
          'phone': _phoneController.text.trim(),
          'email': _emailController.text.trim(),
          'cin': _cinController.text.trim(),
          'role': 'owner',
        });

        setState(() {
          _newOwnerId = docRef.id;
        });
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erreur creation proprietaire: $e')),
      );
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Widget _buildQrCode() {
    if (_newOwnerId == null || _newOwnerId!.trim().isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      children: [
        const SizedBox(height: 20),
        Text(
          'Proprietaire cree: $_newOwnerId',
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: QrImageView(
            data: _newOwnerId!,
            size: 180,
          ),
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
                    decoration: const InputDecoration(labelText: 'Nom'),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Nom requis'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _phoneController,
                    decoration: const InputDecoration(labelText: 'Telephone'),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'Telephone requis'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _emailController,
                    decoration: const InputDecoration(labelText: 'Email'),
                    validator: (value) {
                      final v = (value ?? '').trim();
                      if (v.isEmpty) return 'Email requis';
                      if (!v.contains('@')) return 'Email invalide';
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _cinController,
                    decoration: const InputDecoration(labelText: 'CIN'),
                    validator: (value) => value == null || value.trim().isEmpty
                        ? 'CIN requis'
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

