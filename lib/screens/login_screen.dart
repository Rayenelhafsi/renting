import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'barcode_scanner_screen.dart';
import 'admin_home.dart';
import 'owner_home.dart';
import '../config/app_config.dart';
import '../services/houses_repository.dart';
import '../services/dwira_api_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController usernameController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();
  final TextEditingController ownerIdController = TextEditingController();
  final HousesRepository _housesRepository = const HousesRepository();
  bool isLoading = false;

  Future<void> login() async {
    setState(() => isLoading = true);
    try {
      String email = usernameController.text.trim();
      String password = passwordController.text.trim();

      if (AppConfig.useDwiraApi) {
        await DwiraApiService.instance.loginAdmin(
          email: email,
          password: password,
        );
        if (!context.mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const AdminHomeScreen()),
        );
        return;
      }

      UserCredential userCredential = await FirebaseAuth.instance
          .signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      if (userCredential.user != null) {
        // Do NOT create or update Firestore document for admin on login
        // Admin is identified by email/password login only

        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const AdminHomeScreen()),
        );
      } else {
        throw Exception('Failed to sign in');
      }
    } on FirebaseAuthException catch (e) {
      String message = 'Login failed';
      if (e.code == 'user-not-found') {
        message = 'No user found for that email.';
      } else if (e.code == 'wrong-password') {
        message = 'Wrong password provided.';
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
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

      final ownerExists = await _housesRepository.ownerExists(ownerId);
      if (!ownerExists) {
        throw Exception('Owner ID introuvable ou sans biens');
      }

      // Sign in anonymously for owner
      await FirebaseAuth.instance.signInAnonymously();

      // Do NOT create a new Firestore user document for anonymous user
      // Instead, rely on existing ownerId document for role and authorization
      // Do NOT create or update Firestore document for owner on login

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
      final scannedCode = await Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const BarcodeScannerScreen()),
      );

      if (scannedCode == null || scannedCode == '') {
        // User cancelled the scan or no code scanned
        return;
      }

      final ownerExists = await _housesRepository.ownerExists(scannedCode);
      if (!ownerExists) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Invalid QR code')),
        );
        return;
      }

      // Sign in anonymously for owner
      await FirebaseAuth.instance.signInAnonymously();

      // Do NOT create a new Firestore user document for anonymous user
      // Instead, rely on existing scannedCode document for role and authorization
      // Do NOT create or update Firestore document for owner on login

      // Navigate to owner home screen
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
            builder: (_) => OwnerHomeScreen(ownerId: scannedCode)),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error scanning QR code: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool compact = MediaQuery.of(context).size.width < 520;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFF8F4F0), Color(0xFFF0EDE8)],
          ),
        ),
        child: Center(
          child: isLoading
              ? const CircularProgressIndicator()
              : ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: Card(
                    margin: const EdgeInsets.all(20),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                    ),
                    elevation: 8,
                    child: Padding(
                      padding: EdgeInsets.all(compact ? 18 : 28),
                      child: SingleChildScrollView(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: compact ? 140 : 164,
                              height: compact ? 140 : 164,
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: const LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [Color(0xFF0F5132), Color(0xFF1F8A5B)],
                                ),
                                boxShadow: const [
                                  BoxShadow(
                                    color: Color(0x40000000),
                                    blurRadius: 24,
                                    offset: Offset(0, 10),
                                  ),
                                ],
                              ),
                              child: ClipOval(
                                child: Image.asset(
                                  'assets/images/logo.png',
                                  fit: BoxFit.cover,
                                ),
                              ),
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              'Portail Proprietaires',
                              style: TextStyle(
                                fontSize: 28,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 20),
                            TextField(
                              controller: usernameController,
                              decoration: const InputDecoration(
                                labelText: 'Email admin',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: passwordController,
                              obscureText: true,
                              decoration: const InputDecoration(
                                labelText: 'Mot de passe',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: login,
                                child: const Text('Connexion Admin'),
                              ),
                            ),
                            const SizedBox(height: 14),
                            const Divider(),
                            const SizedBox(height: 14),
                            TextField(
                              controller: ownerIdController,
                              decoration: const InputDecoration(
                                labelText: 'ID proprietaire',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: loginWithOwnerId,
                                child: const Text('Connexion Proprietaire'),
                              ),
                            ),
                            const SizedBox(height: 10),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton.icon(
                                onPressed: scanQRCode,
                                icon: const Icon(Icons.qr_code_scanner),
                                label: const Text('Connexion QR Code'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}

