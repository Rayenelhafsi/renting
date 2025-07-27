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
  Stream<List<Map<String, dynamic>>> _ownersWithHousesStream() {
    final usersStream = FirebaseFirestore.instance
        .collection('users')
        .where('role', isEqualTo: 'owner')
        .snapshots();

    final housesStream = FirebaseFirestore.instance.collection('houses').snapshots();

    return usersStream.asyncMap((usersSnapshot) async {
      final housesSnapshot = await housesStream.first;

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
    });
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

  Future<void> _navigateToHouseDetails(DocumentSnapshot houseDoc) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => HouseDetailsScreen(house: houseDoc),
      ),
    );
    // After returning from house details, refresh the state to update UI
    setState(() {});
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
                  final houseData = house.data() as Map<String, dynamic>;
                  final hasPending =
                      houseData.containsKey('availabilityPending') &&
                          (houseData['availabilityPending'] as List).isNotEmpty;
                  return Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ActionChip(
                        label: Text(house['name']),
                        onPressed: () => _navigateToHouseDetails(house),
                      ),
                      if (hasPending)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.check_circle,
                                  color: Colors.green, size: 20),
                              tooltip: 'Confirm pending changes',
                              onPressed: () async {
                                final ref = FirebaseFirestore.instance
                                    .collection('houses')
                                    .doc(house.id);
                                final pendingAvailability =
                                    houseData['availabilityPending']
                                        as List<dynamic>;
                                final pendingCleaning =
                                    houseData['cleaningSchedulePending']
                                            as List<dynamic>? ?? 
                                        [];
                                await ref.update({
                                  'availability': pendingAvailability,
                                  'cleaningSchedule': pendingCleaning,
                                  'availabilityPending': [],
                                  'cleaningSchedulePending': [],
                                });
                                setState(() {});
                                // Notify user of update
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                      content: Text(
                                          'Pending availability changes confirmed')),
                                );
                              },
                            ),
                          ],
                        ),
                    ],
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
            icon: const Icon(Icons.person_add, color: Color.fromARGB(255, 255, 128, 0)),
            label:
                const Text('New Owner', style: TextStyle(color: Color.fromARGB(255, 255, 128, 0))),
          ),
        ],
      ),
      body: StreamBuilder<List<Map<String, dynamic>>>(
        stream: _ownersWithHousesStream(),
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
