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

    final isSmallScreen = MediaQuery.of(context).size.width < 400;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      elevation: 6,
      shadowColor: Colors.black54,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: const Color.fromARGB(255, 255, 171, 2), width: 2), // Red border like the contour
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Stack(
              children: [
                Center(
                  child: QrImageView(
                    data: ownerDoc.id,
                    size: isSmallScreen ? 80 : 100,
                  ),
                ),
                Positioned(
                  right: 0,
                  top: 0,
                  child: IconButton(
                    icon: const Icon(Icons.delete, color: Colors.red, size: 24),
                    tooltip: 'Delete Owner',
                    onPressed: () async {
                      final confirm = await showDialog<bool>(
                        context: context,
                        builder: (context) => AlertDialog(
                          title: const Text('Confirm Delete'),
                          content: Text('Are you sure you want to delete owner "$ownerName"?'),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.of(context).pop(false),
                              child: const Text('Cancel'),
                            ),
                            TextButton(
                              onPressed: () => Navigator.of(context).pop(true),
                              child: const Text('Delete'),
                            ),
                          ],
                        ),
                      );
                      if (confirm == true) {
                        // Delete owner document
                        await FirebaseFirestore.instance.collection('users').doc(ownerDoc.id).delete();
                        // Optionally delete related houses
                        for (var house in houses) {
                          await FirebaseFirestore.instance.collection('houses').doc(house.id).delete();
                        }
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Owner "$ownerName" deleted')),
                        );
                        setState(() {});
                      }
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              ownerName,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: isSmallScreen ? 18 : 22,
                fontWeight: FontWeight.bold,
                color: Colors.black,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              ownerPhone,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: isSmallScreen ? 14 : 18,
                color: Colors.black,
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              alignment: WrapAlignment.center,
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
                        label: Text(
                          house['name'],
                          style: TextStyle(
                            color: Colors.black,
                            fontSize: isSmallScreen ? 14 : 16,
                          ),
                        ),
                        backgroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          side: const BorderSide(color: Colors.black),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        elevation: 4,
                        shadowColor: Colors.black54,
                        onPressed: () => _navigateToHouseDetails(house),
                      ),
                      if (hasPending)
                        IconButton(
                          icon: Icon(
                            Icons.check_circle,
                            color: Colors.green,
                            size: isSmallScreen ? 18 : 20,
                          ),
                          tooltip: 'Confirm pending changes',
                          onPressed: () async {
                            final ref = FirebaseFirestore.instance
                                .collection('houses')
                                .doc(house.id);
                            final pendingAvailability =
                                houseData['availabilityPending'] as List<dynamic>;
                            final pendingCleaning =
                                houseData['cleaningSchedulePending'] as List<dynamic>? ?? [];
                            await ref.update({
                              'availability': pendingAvailability,
                              'cleaningSchedule': pendingCleaning,
                              'availabilityPending': [],
                              'cleaningSchedulePending': [],
                            });
                            setState(() {});
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Pending availability changes confirmed'),
                              ),
                            );
                          },
                        ),
                    ],
                  );
                }).toList(),
                ElevatedButton(
                  onPressed: () => _navigateToAddHouse(ownerDoc),
                  child: Text(
                    'Add House',
                    style: TextStyle(fontSize: isSmallScreen ? 14 : 16),
                  ),
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
        backgroundColor: Colors.white,
        title: const Text('House Owners (Admin)', style: TextStyle(color: Colors.black)),
        iconTheme: const IconThemeData(color: Colors.black),
        actionsIconTheme: const IconThemeData(color: Colors.black),
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
              final filteredOwnersList = (_selectedOwnerId != null)
                  ? ownersList.where((ownerData) {
                      final ownerDoc = ownerData['owner'] as DocumentSnapshot;
                      return ownerDoc.id == _selectedOwnerId;
                    }).toList()
                  : ownersList;

              return ListView.builder(
                padding: const EdgeInsets.all(8),
                itemCount: filteredOwnersList.length,
                itemBuilder: (context, index) {
                  final ownerData = filteredOwnersList[index];
                  return _buildOwnerCard(ownerData);
                },
              );
            },
          ),
      bottomNavigationBar: Container(
        height: 80,
        color: Colors.black,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
          // Combined row: All Owners, Select House, Select State, Assign Button, Clear Button
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              // All Owners Dropdown
              Expanded(
                flex: 2,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4.0),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      hint: const Text(
                        'All Owners',
                        style: TextStyle(color: Colors.white, fontSize: 10),
                      ),
                      value: _selectedOwnerId,
                      items: _allOwnersDropdownItems(),
                      onChanged: (value) {
                        setState(() {
                          _selectedOwnerId = value;
                          _selectedHouseFilter = null; // reset house filter when owner changes
                          _selectedHouse = null; // reset selected house for assignment
                        });
                      },
                      style: const TextStyle(color: Colors.white, fontSize: 10),
                      iconEnabledColor: Colors.white,
                      dropdownColor: Colors.grey[800],
                      isExpanded: true,
                    ),
                  ),
                ),
              ),
              // Select House Dropdown
              Expanded(
                flex: 3,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4.0),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<DocumentSnapshot>(
                      hint: const Text(
                        'Select House',
                        style: TextStyle(color: Colors.white, fontSize: 10),
                      ),
                      value: _selectedHouse,
                      items: _allHousesDropdownItems(),
                      onChanged: (value) {
                        setState(() {
                          _selectedHouse = value;
                          _selectedState = null;
                        });
                      },
                      style: const TextStyle(color: Colors.white, fontSize: 10),
                      iconEnabledColor: Colors.white,
                      dropdownColor: Colors.grey[800],
                      isExpanded: true,
                    ),
                  ),
                ),
              ),
              // Select State Dropdown
              Expanded(
                flex: 2,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4.0),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      hint: const Text(
                        'Select State',
                        style: TextStyle(color: Colors.white, fontSize: 10),
                      ),
                      value: _selectedState,
                      items: _houseStatesDropdownItems(),
                      onChanged: (value) {
                        setState(() {
                          _selectedState = value;
                        });
                      },
                      style: const TextStyle(color: Colors.white, fontSize: 10),
                      iconEnabledColor: Colors.white,
                      dropdownColor: Colors.grey[800],
                      isExpanded: true,
                    ),
                  ),
                ),
              ),
              // Assign State Button
              Expanded(
                flex: 1,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4.0),
                  child: ElevatedButton(
                    onPressed: (_selectedHouse != null && _selectedState != null)
                        ? _assignStateToHouse
                        : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      disabledBackgroundColor: const Color.fromARGB(255, 158, 158, 158),
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 8),
                      minimumSize: const Size(0, 30),
                    ),
                    child: const Text(
                      'Assign',
                      style: TextStyle(fontSize: 10),
                    ),
                  ),
                ),
              ),
              // Clear Filters Button
              Expanded(
                flex: 1,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4.0),
                  child: ElevatedButton(
                    onPressed: () {
                      setState(() {
                        _selectedOwnerId = null;
                        _selectedHouse = null;
                        _selectedState = null;
                      });
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color.fromARGB(255, 255, 174, 0),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 8),
                      minimumSize: const Size(0, 30),
                    ),
                    child: const Text(
                      'Clear',
                      style: TextStyle(fontSize: 10),
                    ),
                  ),
                ),
              ),
            ],
          ),
          ],
        ),
      ),
    );
  }

  // New state variables for house state assignment
  DocumentSnapshot? _selectedHouse;
  String? _selectedState;
  
  // New state variables for filtering
  String? _selectedOwnerId;
  DocumentSnapshot? _selectedHouseFilter;
  String? _selectedStateFilter;

  // Helper to get all houses for dropdown
  List<DropdownMenuItem<DocumentSnapshot>> _allHousesDropdownItems() {
    // Flatten houses only for the selected owner
    final allHouses = <DocumentSnapshot>[];
    if (_selectedOwnerId != null) {
      for (var owner in _ownersWithHouses) {
        final ownerDoc = owner['owner'] as DocumentSnapshot;
        if (ownerDoc.id == _selectedOwnerId) {
          allHouses.addAll(owner['houses'] as List<DocumentSnapshot>);
          break;
        }
      }
    } else {
      // If no owner selected, show all houses
      for (var owner in _ownersWithHouses) {
        allHouses.addAll(owner['houses'] as List<DocumentSnapshot>);
      }
    }
    return allHouses.map((house) {
      return DropdownMenuItem(
        value: house,
        child: Text(house['name'] ?? 'Unnamed House', style: const TextStyle(fontSize: 12)),
      );
    }).toList();
  }
  
  // Helper to get all owners for dropdown
  List<DropdownMenuItem<String>> _allOwnersDropdownItems() {
    final allOwners = <Map<String, dynamic>>[];
    for (var owner in _ownersWithHouses) {
      final ownerDoc = owner['owner'] as DocumentSnapshot;
      final ownerData = ownerDoc.data() as Map<String, dynamic>;
      final String ownerName = (ownerData['name'] is String) 
          ? ownerData['name'] as String 
          : 'Unnamed Owner';
      allOwners.add({
        'id': ownerDoc.id,
        'name': ownerName
      });
    }
    return allOwners.map((owner) {
      return DropdownMenuItem<String>(
        value: owner['id'] as String,
        child: Text(owner['name'] as String, style: const TextStyle(fontSize: 12)),
      );
    }).toList();
  }

  // Helper to get house states for dropdown
  List<DropdownMenuItem<String>> _houseStatesDropdownItems() {
    const states = [
      'Cleaning Now',
      'Done Cleaned',
      'Plumber Assigned',
      'Electrician Assigned',
      'Food Delivery Assigned',
    ];
    return states.map((state) {
      return DropdownMenuItem(
        value: state,
        child: Text(state, style: const TextStyle(fontSize: 12)),
      );
    }).toList();
  }

  // Store owners with houses for dropdown helper
  List<Map<String, dynamic>> _ownersWithHouses = [];

  @override
  void initState() {
    super.initState();
    _ownersWithHousesStream().listen((owners) {
      setState(() {
        _ownersWithHouses = owners;
      });
    });
  }

  // Assign selected state to selected house in Firestore
  Future<void> _assignStateToHouse() async {
    if (_selectedHouse == null || _selectedState == null) return;

    final houseRef = FirebaseFirestore.instance.collection('houses').doc(_selectedHouse!.id);

    // Map state string to Firestore field updates
    Map<String, dynamic> updateData = {};

    switch (_selectedState) {
      case 'Cleaning Now':
        updateData['cleaningStatus'] = 'cleaning';
        break;
      case 'Done Cleaned':
        updateData['cleaningStatus'] = 'done';
        break;
      case 'Plumber Assigned':
        updateData['plumberStatus'] = 'assigned';
        break;
      case 'Electrician Assigned':
        updateData['electricianStatus'] = 'assigned';
        break;
      case 'Food Delivery Assigned':
        updateData['foodDeliveryStatus'] = 'assigned';
        break;
    }

    await houseRef.update(updateData);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('State "${_selectedState!}" assigned to house "${_selectedHouse!['name']}"')),
    );

    setState(() {
      _selectedHouse = null;
      _selectedState = null;
    });
  }
}
