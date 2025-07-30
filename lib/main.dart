import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

// Écrans
import 'screens/login_screen.dart';
import 'screens/owner_home.dart';
import 'screens/admin_home.dart';

// Fichier de config Firebase (à générer avec `flutterfire configure`)
import 'firebase_options.dart' as firebase_options;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: firebase_options.DefaultFirebaseOptions.currentPlatform,
  );

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'House Rental Manager',
      theme: ThemeData.dark().copyWith(
        useMaterial3: true,
        textTheme: ThemeData.dark().textTheme.apply(
          bodyColor: Colors.white,
          displayColor: Colors.white,
          fontFamily: 'Cinzel',
        ),
        colorScheme: ColorScheme.dark(
          primary: Colors.white,
          onPrimary: Colors.white,
          background: Colors.black,
          onBackground: Colors.white,
        ),
      ),
      home: const Root(),
    );
  }
}

class Root extends StatefulWidget {
  const Root({super.key});

  @override
  State<Root> createState() => _RootState();
}

class _RootState extends State<Root> {
  User? _user;
  DocumentSnapshot? _userDoc;
  late final Stream<User?> _authStateChanges;
  Stream<DocumentSnapshot>? _userDocStream;

  @override
  void initState() {
    super.initState();
    _authStateChanges = FirebaseAuth.instance.authStateChanges();
    _authStateChanges.listen((user) {
      setState(() {
        _user = user;
        if (user != null) {
          _userDocStream = FirebaseFirestore.instance
              .collection('users')
              .doc(user.uid)
              .snapshots();
          _userDocStream!.listen((doc) {
            setState(() {
              _userDoc = doc;
            });
          });
        } else {
          _userDocStream = null;
          _userDoc = null;
        }
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_user == null) {
      return const LoginScreen();
    }

    if (_userDoc == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (!_userDoc!.exists) {
      return const LoginScreen();
    }

    final role = _userDoc!['role'];

    if (role == 'admin') {
      return const AdminHomeScreen();
    } else {
      return const OwnerHomeScreen();
    }
  }
}
