import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_barcode_scanner/flutter_barcode_scanner.dart';
import 'admin_home.dart';
import 'owner_home.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController usernameController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();
  final TextEditingController ownerIdController = TextEditingController();
  bool isLoading = false;

  Future<void> login() async {
    setState(() => isLoading = true);
    try {
      String username = usernameController.text.trim();
      String password = passwordController.text.trim();

      if (username == 'root' && password == 'd90087579c') {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const AdminHomeScreen()),
        );
      } else {
        throw Exception('Invalid username or password');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      setState(() => isLoading = false);
    }
  }

  Future<void> loginWithOwnerId() async {
    setState(() => isLoading = true);
    try {
      String ownerId = ownerIdController.text.trim();

      if (ownerId.isEmpty) {
        throw Exception('Please enter your Owner ID');
      }

      DocumentSnapshot userDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(ownerId)
          .get();

      if (!userDoc.exists) {
        throw Exception('Owner ID does not exist');
      }

      String role = userDoc['role'];
      if (role != 'owner') {
        throw Exception('User is not an owner');
      }

      // Navigate to owner home screen
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => OwnerHomeScreen(ownerId: ownerId)),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      setState(() => isLoading = false);
    }
  }

  Future<void> scanQRCode() async {
    try {
      String scannedCode = await FlutterBarcodeScanner.scanBarcode(
        '#ff6666', // scanning line color
        'Cancel', // cancel button text
        true, // show flash icon
        ScanMode.QR,
      );

      if (scannedCode == '-1') {
        // User cancelled the scan
        return;
      }

      // Validate scannedCode against Firestore users collection
      DocumentSnapshot userDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(scannedCode)
          .get();

      if (!userDoc.exists) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Invalid QR code')),
        );
        return;
      }

      String role = userDoc['role'];
      if (role != 'owner') {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('QR code does not belong to an owner')),
        );
        return;
      }

      // Navigate to owner home screen
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => OwnerHomeScreen(ownerId: scannedCode)),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error scanning QR code: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: isLoading
            ? const CircularProgressIndicator()
            : Padding(
                padding: const EdgeInsets.all(24.0),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text('Login', style: TextStyle(fontSize: 32)),
                      const SizedBox(height: 20),
                      TextField(
                        controller: usernameController,
                        decoration: const InputDecoration(
                          labelText: 'Username',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: passwordController,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 20),
                      ElevatedButton(
                        onPressed: login,
                        child: const Text('Login'),
                      ),
                      const SizedBox(height: 20),
                      const Divider(),
                      const SizedBox(height: 20),
                      TextField(
                        controller: ownerIdController,
                        decoration: const InputDecoration(
                          labelText: 'Owner ID',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: loginWithOwnerId,
                        child: const Text('Login as Owner'),
                      ),
                      const SizedBox(height: 20),
                      ElevatedButton.icon(
                        onPressed: scanQRCode,
                        icon: const Icon(Icons.qr_code_scanner),
                        label: const Text('Login with QR Code'),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}
