import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'barcode_scanner_screen.dart';
import 'admin_home.dart';
import 'owner_home.dart';
import '../config/app_config.dart';
import '../services/houses_repository.dart';
import '../services/dwira_api_service.dart';
import '../services/session_storage.dart';

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
  bool _adminPasswordHidden = true;

  InputDecoration _fieldDecoration({
    required String label,
    IconData? icon,
    Widget? suffixIcon,
  }) {
    return InputDecoration(
      labelText: label,
      prefixIcon: icon == null ? null : Icon(icon),
      suffixIcon: suffixIcon,
      filled: true,
      fillColor: const Color(0xFFF7FBF8),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: Color(0xFFDCE8E0), width: 1.2),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: Color(0xFF177245), width: 1.5),
      ),
    );
  }

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
        await PersistedSession.saveAdmin(email: email, password: password);
        if (!context.mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const AdminHomeScreen()),
        );
        return;
      }

      UserCredential userCredential =
          await FirebaseAuth.instance.signInWithEmailAndPassword(
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
      await PersistedSession.saveOwner(ownerId);

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

      if (!mounted) return;

      if (scannedCode == null || scannedCode == '') {
        // User cancelled the scan or no code scanned
        return;
      }

      setState(() => isLoading = true);

      final ownerExists = await _housesRepository.ownerExists(scannedCode);
      if (!ownerExists) {
        setState(() => isLoading = false);
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
      await PersistedSession.saveOwner(scannedCode);

      if (!mounted) return;

      // Navigate to owner home screen
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => OwnerHomeScreen(ownerId: scannedCode),
        ),
        (route) => false,
      );
    } catch (e) {
      if (mounted) {
        setState(() => isLoading = false);
      }
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
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFF4FBF7), Color(0xFFF7F3EC), Color(0xFFEAF6EE)],
          ),
        ),
        child: Center(
          child: isLoading
              ? const CircularProgressIndicator()
              : ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: Container(
                    margin: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFDFEFD),
                      borderRadius: BorderRadius.circular(32),
                      border: Border.all(color: const Color(0xFFE2ECE5)),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x14000000),
                          blurRadius: 28,
                          offset: Offset(0, 18),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: EdgeInsets.all(compact ? 20 : 30),
                      child: SingleChildScrollView(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Center(
                              child: Container(
                                width: compact ? 128 : 150,
                                height: compact ? 128 : 150,
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: const LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [
                                      Color(0xFF0F5132),
                                      Color(0xFF16693F),
                                      Color(0xFF1F8A5B)
                                    ],
                                  ),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: Color(0x220F5132),
                                      blurRadius: 30,
                                      offset: Offset(0, 14),
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
                            ),
                            const SizedBox(height: 20),
                            const Center(
                              child: Text(
                                'Connexion',
                                style: TextStyle(
                                  fontSize: 32,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF0F5132),
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            const Center(
                              child: Text(
                                'Acces proprietaire et administration',
                                style: TextStyle(
                                  fontSize: 14,
                                  color: Color(0xFF6B7280),
                                ),
                              ),
                            ),
                            const SizedBox(height: 24),
                            Container(
                              padding: const EdgeInsets.all(18),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF6FBF8),
                                borderRadius: BorderRadius.circular(24),
                                border: Border.all(color: const Color(0xFFDCE8E0)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Connexion Proprietaire',
                                    style: TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xFF0F5132),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  const Text(
                                    'Entrez votre identifiant ou utilisez le QR code.',
                                    style: TextStyle(color: Color(0xFF6B7280)),
                                  ),
                                  const SizedBox(height: 16),
                                  TextField(
                                    controller: ownerIdController,
                                    decoration: _fieldDecoration(
                                      label: 'ID proprietaire',
                                      icon: Icons.badge_outlined,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  SizedBox(
                                    width: double.infinity,
                                    child: ElevatedButton(
                                      onPressed: loginWithOwnerId,
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: const Color(0xFF14683F),
                                        foregroundColor: Colors.white,
                                        elevation: 0,
                                        padding: const EdgeInsets.symmetric(vertical: 16),
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(18),
                                        ),
                                      ),
                                      child: const Text(
                                        'Connexion Proprietaire',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 16,
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  SizedBox(
                                    width: double.infinity,
                                    child: OutlinedButton.icon(
                                      onPressed: scanQRCode,
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: const Color(0xFF14683F),
                                        backgroundColor: Colors.white,
                                        side: const BorderSide(
                                          color: Color(0xFFB7D4C0),
                                        ),
                                        padding: const EdgeInsets.symmetric(vertical: 15),
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(18),
                                        ),
                                      ),
                                      icon: const Icon(Icons.qr_code_scanner),
                                      label: const Text(
                                        'Connexion QR Code',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 15,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 18),
                            Row(
                              children: const [
                                Expanded(
                                  child: Divider(color: Color(0xFFD6E1DB)),
                                ),
                                Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 12),
                                  child: Text(
                                    'Administration',
                                    style: TextStyle(
                                      color: Color(0xFF7A8A80),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                Expanded(
                                  child: Divider(color: Color(0xFFD6E1DB)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 18),
                            TextField(
                              controller: usernameController,
                              decoration: _fieldDecoration(
                                label: 'Email admin',
                                icon: Icons.alternate_email_rounded,
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: passwordController,
                              obscureText: _adminPasswordHidden,
                              decoration: _fieldDecoration(
                                label: 'Mot de passe',
                                icon: Icons.lock_outline_rounded,
                                suffixIcon: IconButton(
                                  onPressed: () {
                                    setState(() {
                                      _adminPasswordHidden =
                                          !_adminPasswordHidden;
                                    });
                                  },
                                  icon: Icon(
                                    _adminPasswordHidden
                                        ? Icons.visibility_off_outlined
                                        : Icons.visibility_outlined,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: login,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF0F5132),
                                  foregroundColor: Colors.white,
                                  elevation: 0,
                                  padding: const EdgeInsets.symmetric(vertical: 16),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(18),
                                  ),
                                ),
                                child: const Text(
                                  'Connexion Admin',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                  ),
                                ),
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
