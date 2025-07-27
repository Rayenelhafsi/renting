import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../main.dart';
import 'house_details.dart';
import 'admin_qr_code_screen.dart';
import 'login_screen.dart';
import 'add_house_screen.dart';
import 'create_owner_screen.dart';

class AdminHomeScreen extends StatefulWidget {
  const AdminHomeScreen({super.key});

  @override
  State<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends State<AdminHomeScreen> {
  late Future<List<Map<String, dynamic>>> _ownersWithHousesFuture;

  @override
  void initState() {
    super.initState();
    _ownersWithHousesFuture = _fetchOwnersWithHouses();
  }

  Future<List<Map<String, dynamic>>> _fetchOwnersWithHouses() async {
    final usersSnapshot = await FirebaseFirestore.instance
        .collection('users')
        .where('role', isEqualTo: 'owner')
        .get();

    final housesSnapshot =
        await FirebaseFirestore.instance.collection('houses').get();

    // Map ownerId to list of houses
    final Map<String, List<DocumentSnapshot>> ownerHousesMap = {};
    for (var house in housesSnapshot.docs) {
      final ownerId = house['ownerId'];
      if (ownerHousesMap.containsKey(ownerId)) {
        ownerHousesMap[ownerId]!.add(house);
      } else {
        ownerHousesMap[ownerId] = [house];
      }
    }

    return usersSnapshot.docs.map((ownerDoc) {
      final ownerId = ownerDoc.id;
      return {
        'owner': ownerDoc,
        'houses': ownerHousesMap[ownerId] ?? [],
      };
    }).toList();
  }

  void _logout(BuildContext context) async {
    await FirebaseAuth.instance.signOut();
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (context) => const LoginScreen()),
      (route) => false,
    );
  }

  void _navigateToAddHouse(DocumentSnapshot ownerDoc) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => AddHouseScreen(ownerId: ownerDoc.id),
      ),
    );
  }

  void _navigateToHouseDetails(DocumentSnapshot houseDoc) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => HouseDetailsScreen(house: houseDoc),
      ),
    );
  }

  void _navigateToCreateOwner() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const CreateOwnerScreen(),
      ),
    );
  }

  Widget _buildOwnerCard(Map<String, dynamic> ownerData) {
    final ownerDoc = ownerData['owner'] as DocumentSnapshot;
    final houses = ownerData['houses'] as List<DocumentSnapshot>;

    final ownerName = ownerDoc['name'] ?? 'No Name';
    final ownerPhone = ownerDoc['phone'] ?? 'No Phone';

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                QrImageView(
                  data: ownerDoc.id,
                  size: 80,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ownerName,
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text(ownerPhone, style: const TextStyle(fontSize: 16)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ...houses.map((house) {
                  return ActionChip(
                    label: Text(house['name']),
                    onPressed: () => _navigateToHouseDetails(house),
                  );
                }).toList(),
                ActionChip(
                  label: const Text('Add House'),
                  avatar: const Icon(Icons.add),
                  onPressed: () => _navigateToAddHouse(ownerDoc),
                ),
              ],
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
        title: const Text('House Owners (Admin)'),
        actions: [
          IconButton(
            onPressed: () => _logout(context),
            icon: const Icon(Icons.logout),
          ),
          TextButton.icon(
            onPressed: _navigateToCreateOwner,
            icon: const Icon(Icons.person_add, color: Colors.white),
            label:
                const Text('New Owner', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _ownersWithHousesFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return const Center(child: Text('No owners found.'));
          }

          final ownersList = snapshot.data!;
          return ListView.builder(
            itemCount: ownersList.length,
            itemBuilder: (context, index) {
              return _buildOwnerCard(ownersList[index]);
            },
          );
        },
      ),
    );
  }
}
