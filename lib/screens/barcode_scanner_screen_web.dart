import 'package:flutter/material.dart';

class BarcodeScannerScreen extends StatefulWidget {
  const BarcodeScannerScreen({super.key});

  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  final TextEditingController _manualCodeController = TextEditingController();

  @override
  void dispose() {
    _manualCodeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('QR Code (Web)')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'Le scanner caméra est désactivé sur Web.\nEntrez le code propriétaire manuellement.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _manualCodeController,
              decoration: const InputDecoration(
                labelText: 'Code propriétaire',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () =>
                    Navigator.of(context).pop(_manualCodeController.text.trim()),
                child: const Text('Valider'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
