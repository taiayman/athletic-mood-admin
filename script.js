// script.js
// Note: Using Firestore Compat API for easier transition from placeholders
// For new projects, consider the modular v9 API.

document.addEventListener('DOMContentLoaded', () => {
    // Check if db is initialized (from HTML)
    if (typeof db === 'undefined') {
        console.error("Firebase Firestore (db) is not initialized. Check HTML script order and config.");
        alert("Error initializing database connection. Dashboard may not function correctly.");
        return;
    }

    // --- Element Selectors ---
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const contentSections = document.querySelectorAll('.main-content .content-section');
    const userModal = document.getElementById('user-modal');
    const facilityModal = document.getElementById('facility-modal');
    const confirmationModal = document.getElementById('confirmation-modal');
    const statusModal = document.getElementById('status-modal');
    const detailsModal = document.getElementById('details-modal');
    const closeModalBtns = document.querySelectorAll('.modal .close-btn');
    const userForm = document.getElementById('user-form');
    const facilityForm = document.getElementById('facility-form');
    const statusForm = document.getElementById('status-form');
    const addUserBtn = document.getElementById('add-user-btn');
    const addFacilityBtn = document.getElementById('add-facility-btn');
    const logoutButton = document.getElementById('logout-button');
    const mainContentArea = document.querySelector('.main-content'); // For event delegation

    // --- Pagination State ---
    let currentPage = 1;
    const itemsPerPage = 25; // INCREASED ITEMS PER PAGE
    let totalItems = 0;
    let currentCollection = ''; // Track which collection pagination applies to
    let lastVisibleDoc = null; // For Firestore pagination

    // --- Firebase Functions (Replacing Placeholders) ---

    // Function to fetch data with optional filtering, sorting, pagination
    const fetchData = async (collectionPath, options = {}) => {
        const { filters = [], sortBy = null, sortOrder = 'asc', limitCount = itemsPerPage, startAfterDoc = null } = options;
        let query = db.collection(collectionPath);

        // Apply filters (where clauses)
        filters.forEach(filter => {
            if (filter.field && filter.operator && filter.value !== undefined) {
                query = query.where(filter.field, filter.operator, filter.value);
            }
        });

        // Apply sorting
        if (sortBy) {
            query = query.orderBy(sortBy, sortOrder);
        }

        // Apply pagination start point
        if (startAfterDoc) {
            query = query.startAfter(startAfterDoc);
        }

        // Apply limit
        query = query.limit(limitCount);

        console.log(`Fetching from ${collectionPath} with options:`, options);
        const snapshot = await query.get();
        console.log(`Fetched ${snapshot.docs.length} documents from ${collectionPath}`);

        // Also get total count for pagination (might need separate query or Cloud Function for large datasets)
        // For simplicity here, we fetch total based on filters only (less accurate for large sets)
        let countQuery = db.collection(collectionPath);
         filters.forEach(filter => {
            if (filter.field && filter.operator && filter.value !== undefined) {
                countQuery = countQuery.where(filter.field, filter.operator, filter.value);
            }
        });
        // Firestore compat doesn't have count(). A full count is expensive.
        // We'll estimate total based on whether we got a full page back, or use a fixed large number.
        // A better approach needs server-side aggregation (Cloud Function).
        // Let's simulate total count roughly for UI.
        const approxTotal = snapshot.docs.length < limitCount ? (currentPage - 1) * limitCount + snapshot.docs.length : currentPage * limitCount + 1; // Rough estimate

        return {
            docs: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
            totalCount: approxTotal // Placeholder total count
        };
    };

    // Fetch users from all relevant collections
    const fetchUsers = async (options = {}) => {
        const { filters = [], startAfterDoc = null, limitCount = itemsPerPage } = options;
        const userTypeFilterValue = filters.find(f => f.field === 'userType')?.value;
        const userSearchQuery = filters.find(f => f.field === 'search')?.value?.toLowerCase();

        if (userTypeFilterValue === 'professional') {
            console.log("Fetching ONLY professionals with options:", options);
            let professionalQuery = db.collection('professionals');
            
            // Apply sorting: Pending first, then by last update
            professionalQuery = professionalQuery.orderBy('isApproved', 'asc')
                                               .orderBy('updatedAt', 'desc');

            // Note: Firestore requires the first orderBy field to be in an equality or range filter if multiple exist.
            // If we add more filters on 'professionals', we might need to create a composite index or adjust.
            // For now, 'isApproved' and 'updatedAt' are the primary sort drivers after initial collection selection.

            // Client-side search is applied after fetching the sorted & paginated page.
            // This means search only applies to the current page of sorted results.
            // For global search on sorted results, a more complex server-side solution or search service (e.g., Algolia) is needed.

            if (startAfterDoc) {
                professionalQuery = professionalQuery.startAfter(startAfterDoc);
            }
            professionalQuery = professionalQuery.limit(limitCount);

            const snapshot = await professionalQuery.get();
            let professionals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), userType: 'professional' }));

            if (userSearchQuery) {
                professionals = professionals.filter(prof =>
                    (prof.businessName?.toLowerCase() || '').includes(userSearchQuery) ||
                    (prof.email?.toLowerCase() || '').includes(userSearchQuery) ||
                    (prof.apeCode?.toLowerCase() || '').includes(userSearchQuery)
                );
            }
            
            // Total count of ALL professionals (ignoring pagination but respecting initial filters if any were applied to collection directly)
            // For accurate pagination display, this count is important.
            // If search is active, totalCount should ideally reflect total searchable items, but client-side search complicates this.
            // For now, we'll use the total in the professionals collection if no search, or current page results if search.
            let totalProfessionalsCount = professionals.length; // Default if searching
            if (!userSearchQuery) {
                 const totalCountSnapshot = await db.collection('professionals').get(); // Potentially slow for very large collections
                 totalProfessionalsCount = totalCountSnapshot.size;
            }

            return {
                users: professionals,
                lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
                totalCount: totalProfessionalsCount 
            };

        } else {
            // Existing logic for fetching combined users if filter is not 'professional' or is 'all'
            const collections = ['users', 'professionals', 'clubs', 'arenas'];
            let allUsers = [];
            let combinedLastDoc = null; 
            let combinedTotal = 0;

            for (const col of collections) {
                if (!userTypeFilterValue || userTypeFilterValue === 'all' || userTypeFilterValue === col.slice(0, -1)) { // col is plural, type is singular
                    try {
                        // Pass down sortBy, sortOrder, limitCount, startAfterDoc for individual collection fetches
                        const fetchOptionsForCollection = {
                            filters: filters.filter(f => f.field !== 'userType' && f.field !== 'search'), // Remove global filters
                            sortBy: options.sortBy,
                            sortOrder: options.sortOrder,
                            limitCount: limitCount,
                            startAfterDoc: startAfterDoc // This is tricky with multiple collections, needs refinement for true pagination
                        };
                        // If a specific type is filtered (not 'all'), only query that collection
                        if (userTypeFilterValue && userTypeFilterValue !== 'all' && col !== `${userTypeFilterValue}s`){
                            //skip if not the selected type
                        } else {
                             const { docs, lastDoc, totalCount } = await fetchData(col, fetchOptionsForCollection);
                             allUsers.push(...docs.map(d => ({...d, userType: d.userType || col.slice(0,-1)}))); // ensure userType
                             if (lastDoc) combinedLastDoc = lastDoc; 
                             combinedTotal += totalCount; 
                        }
                    } catch (error) {
                        console.error(`Error fetching from ${col}:`, error);
                    }
                }
            }
            
            let uniqueUsers = Array.from(new Map(allUsers.map(user => [user.id, user])).values());

            if (userSearchQuery) {
                uniqueUsers = uniqueUsers.filter(user =>
                    (user.firstName?.toLowerCase() || '').includes(userSearchQuery) ||
                    (user.lastName?.toLowerCase() || '').includes(userSearchQuery) ||
                    (user.businessName?.toLowerCase() || '').includes(userSearchQuery) ||
                    (user.clubName?.toLowerCase() || '').includes(userSearchQuery) ||
                    (user.arenaName?.toLowerCase() || '').includes(userSearchQuery) ||
                    (user.email?.toLowerCase() || '').includes(userSearchQuery)
                );
            }
            // Sort client-side if sortBy is provided for combined results
            if(options.sortBy && uniqueUsers.length > 0){
                uniqueUsers.sort((a,b) => {
                    const valA = a[options.sortBy];
                    const valB = b[options.sortBy];
                    let comparison = 0;
                    if(valA > valB) comparison = 1;
                    else if (valA < valB) comparison = -1;
                    return options.sortOrder === 'desc' ? (comparison * -1) : comparison;
                });
            }


            return { users: uniqueUsers, lastDoc: combinedLastDoc, totalCount: uniqueUsers.length }; // totalCount is approximate here
        }
    };


    // --- Specific Firebase CRUD Functions ---

    const getUserData = async (userId) => {
        const collections = ['users', 'professionals', 'clubs', 'arenas'];
        for (const col of collections) {
            const docRef = db.collection(col).doc(userId);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                return { id: docSnap.id, ...docSnap.data() };
            }
        }
        return null; // User not found in any collection
    };

    const firebaseUpdateUser = async (userId, userData) => {
        // Determine collection based on userData.userType or fetch user first
        const collections = ['users', 'professionals', 'clubs', 'arenas'];
        let collectionPath = 'users'; // Default
        const existingUser = await getUserData(userId);
        if (existingUser?.userType) {
            switch(existingUser.userType) {
                case 'professional': collectionPath = 'professionals'; break;
                case 'club': collectionPath = 'clubs'; break;
                case 'arena': collectionPath = 'arenas'; break;
            }
        }

        console.log(`Updating user ${userId} in ${collectionPath} with:`, userData);
        const userRef = db.collection(collectionPath).doc(userId);
        try {
            await userRef.update(userData); // Use update instead of set merge to avoid creating doc
            return true;
        } catch (error) {
            console.error("Error updating user:", error);
            return false;
        }
    };

    const firebaseDeleteUser = async (userId) => {
        // Need to find which collection the user is in first
        const collections = ['users', 'professionals', 'clubs', 'arenas'];
        console.log(`Attempting to delete user ${userId}`);
        try {
            let deleted = false;
            for (const col of collections) {
                const docRef = db.collection(col).doc(userId);
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    await docRef.delete();
                    console.log(`Deleted user ${userId} from ${col}`);
                    deleted = true;
                    break; // Assume user only exists in one primary collection
                }
            }
            if (!deleted) console.warn(`User ${userId} not found for deletion.`);
            // TODO: Consider deleting associated Firebase Auth user if applicable
            // TODO: Consider deleting related data (activities, teams etc.) - DANGEROUS, use Cloud Functions ideally
            return deleted;
        } catch (error) {
            console.error("Error deleting user:", error);
            return false;
        }
    };

     const firebaseAddUser = async (userData) => {
        // Determine collection based on type
        let collectionPath = 'users';
        switch(userData.type) { // Assuming userData has a 'type' field from modal
            case 'professional': collectionPath = 'professionals'; break;
            case 'club': collectionPath = 'clubs'; break;
            case 'arena': collectionPath = 'arenas'; break;
        }
         console.log('Adding user to:', collectionPath, userData);
        try {
            // This ONLY adds to Firestore, doesn't create Firebase Auth user
            const docRef = await db.collection(collectionPath).add(userData);
            console.log("User added with ID:", docRef.id);
            return { id: docRef.id, ...userData };
        } catch (error) {
            console.error("Error adding user:", error);
            return null;
        }
     };

      const firebaseUpdateActivity = async (activityId, data) => {
         console.log(`Updating activity ${activityId} with:`, data);
         const activityRef = db.collection('activities').doc(activityId);
         try {
             await activityRef.update(data);
             return true;
         } catch (error) {
             console.error("Error updating activity:", error);
             return false;
         }
     };

      const firebaseDeleteActivity = async (activityId) => {
        console.log(`Deleting activity ${activityId}`);
        const activityRef = db.collection('activities').doc(activityId);
        try {
            // Optional: Delete messages subcollection first (use Cloud Function for safety)
            // await deleteCollection(db, `activities/${activityId}/messages`, 10);
            await activityRef.delete();
            return true;
        } catch (error) {
            console.error("Error deleting activity:", error);
            return false;
        }
      };

       const firebaseUpdateFacility = async (facilityId, data) => {
         console.log(`Updating facility ${facilityId} with:`, data);
         const facilityRef = db.collection('facilities').doc(facilityId);
         try {
             // Remove arenaId if it exists in data, as it shouldn't change normally
             delete data.arenaId;
             await facilityRef.update(data);
             return true;
         } catch (error) {
             console.error("Error updating facility:", error);
             return false;
         }
     };

     const firebaseDeleteFacility = async (facilityId) => {
        console.log(`Deleting facility ${facilityId}`);
        const facilityRef = db.collection('facilities').doc(facilityId);
        try {
            // TODO: Check for related bookings before deleting? Or handle orphaned bookings?
            await facilityRef.delete();
            return true;
        } catch (error) {
            console.error("Error deleting facility:", error);
            return false;
        }
     };

      const firebaseAddFacility = async (facilityData) => {
         console.log('Adding facility:', facilityData);
         try {
             const docRef = await db.collection('facilities').add(facilityData);
             return { id: docRef.id, ...facilityData };
         } catch (error) {
             console.error("Error adding facility:", error);
             return null;
         }
      };

       const firebaseUpdateBookingStatus = async (bookingId, newStatus) => {
         console.log(`Updating booking ${bookingId} status to ${newStatus}`);
         const bookingRef = db.collection('facility_bookings').doc(bookingId);
         try {
             await bookingRef.update({ status: newStatus, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
             return true;
         } catch (error) {
             console.error("Error updating booking status:", error);
             return false;
         }
       };

      const firebaseDeleteConversation = async (conversationId) => {
        console.log(`Deleting conversation ${conversationId}`);
        const convRef = db.collection('conversations').doc(conversationId);
         try {
             // Optional: Delete messages subcollection first (use Cloud Function for safety)
             await convRef.delete();
             return true;
         } catch (error) {
             console.error("Error deleting conversation:", error);
             return false;
         }
       };

      const firebaseLogout = async () => {
         console.log("Placeholder: Logging out admin user");
         alert("Logged out (Simulated)");
         window.location.href = "#dashboard"; // Simulate redirect
     }

    // --- UI Rendering Functions (Updated) ---

    const formatDate = (timestamp) => {
        if (timestamp && timestamp.toDate) {
            return timestamp.toDate().toLocaleDateString();
        }
        if (timestamp instanceof Date) {
            return timestamp.toLocaleDateString();
        }
        return 'N/A';
    };

     const formatDateTime = (timestamp) => {
        if (timestamp && timestamp.toDate) {
            return timestamp.toDate().toLocaleString();
        }
         if (timestamp instanceof Date) {
            return timestamp.toLocaleString();
        }
        return 'N/A';
    };

    const renderUserTable = (users) => {
        const tableBody = document.getElementById('user-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        const currentUserTypeFilter = document.getElementById('user-type-filter')?.value || 'all';

        users.forEach(user => {
            const row = tableBody.insertRow();
            row.dataset.userId = user.id; // Store user ID for easy access

            if (currentUserTypeFilter === 'professional' && user.userType === 'professional') {
                // --- Professional User Row --- 
                const isVerified = user.isVerified === true;
                const isApproved = user.isApproved === true;

                row.innerHTML = `
                    <td>
                        <div>${user.businessName || 'N/A'}</div>
                        <small class="text-muted">${user.email || 'N/A'}</small>
                    </td>
                    <td><span class="status-badge type-professional">Professional</span></td>
                    <td><span class="status-badge status-${isVerified ? 'active' : 'inactive'}">${isVerified ? 'Yes' : 'No'}</span></td>
                    <td><span class="status-badge status-${isApproved ? 'active' : 'pending'}">${isApproved ? 'Yes' : 'No'}</span></td>
                    <td>${formatDate(user.createdAt || user.updatedAt)}</td>
                    <td class="actions">
                        <button class="btn btn-sm btn-approve ${isApproved ? 'btn-disabled' : 'btn-success'}" 
                                data-id="${user.id}" 
                                title="Approve Professional" 
                                ${isApproved ? 'disabled' : ''}>
                            <i class="fas fa-check"></i> ${isApproved ? 'Approved' : 'Approve'}
                        </button>
                        <button class="btn btn-sm btn-info view-details-btn" data-id="${user.id}" title="View Details">
                            <i class="fas fa-eye"></i> Details <!-- Changed icon -->
                        </button>
                    </td>
                `;
            } else {
                // --- Default User Row (existing logic) ---
                const userType = user.userType || (user.hasOwnProperty('clubName') ? 'club' : (user.hasOwnProperty('arenaName') ? 'arena' : 'individual'));
                row.innerHTML = `
                    <td>${user.fullName || user.businessName || user.clubName || user.arenaName || user.id}</td>
                    <td>${user.email || 'N/A'}</td>
                    <td><span class="status-badge type-${userType}">${userType}</span></td>
                    <td>${formatDate(user.createdAt)}</td>
                    <td class="actions">
                        <button class="btn btn-sm btn-info view-btn" data-id="${user.id}" title="View Details"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-sm btn-warning edit-btn" data-id="${user.id}" title="Edit User"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger delete-btn" data-id="${user.id}" title="Delete User"><i class="fas fa-trash"></i></button>
                    </td>
                `;
            }
        });
    };

    const renderActivityTable = (activities) => {
        const tableBody = document.getElementById('activity-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        activities.forEach(activity => {
            const isBoosted = activity.isBoosted && (!activity.boostExpiryDate || activity.boostExpiryDate.toDate() > new Date());
            const creatorName = activity.creatorName || activity.creatorId;
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${activity.name}</td>
                <td>${activity.type}</td>
                <td>${formatDateTime(activity.dateTime)}</td>
                <td>${creatorName}</td>
                <td>${activity.participants?.length ?? 0}/${activity.maxParticipants}</td>
                <td><span class="status-badge ${isBoosted ? 'boosted' : 'default'}">${isBoosted ? 'Boosted' : 'No'}</span></td>
                <td class="actions">
                    <button class="view-btn" data-id="${activity.id}" title="View Details"><i class="fas fa-eye"></i></button>
                    <button class="edit-btn" data-id="${activity.id}" title="Edit Activity"><i class="fas fa-edit"></i></button>
                    <button class="status-btn" data-id="${activity.id}" data-boosted="${isBoosted}" title="Toggle Boost"><i class="fas fa-rocket"></i></button>
                    <button class="delete-btn" data-id="${activity.id}" title="Delete Activity"><i class="fas fa-trash"></i></button>
                </td>
            `;
        });
    };

     const renderEventTable = (events) => {
        const tableBody = document.getElementById('event-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        events.forEach(event => {
            const organizerName = event.organizerName || event.organizerId;
            const eventTypeLabel = event.isTournament ? 'Tournament' : (event.isForCouples ? 'Couples' : (event.isForSingles ? 'Singles' : event.eventType));
             const isPaid = event.isPaid ?? false;
             const price = event.price ?? 0;
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${event.name}</td>
                <td>${eventTypeLabel} (${event.sportType})</td>
                <td>${formatDateTime(event.dateTime)}</td>
                 <td>${organizerName}</td>
                <td>${event.participants?.length ?? 0}/${event.maxParticipants}</td>
                 <td><span class="status-badge ${isPaid ? 'paid' : 'free'}">${isPaid ? `Paid (${price.toFixed(2)}€)` : 'Free'}</span></td>
                 <td class="actions">
                    <button class="view-btn" data-id="${event.id}" title="View Details"><i class="fas fa-eye"></i></button>
                     <button class="edit-btn" data-id="${event.id}" title="Edit Event"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" data-id="${event.id}" title="Delete Event"><i class="fas fa-trash"></i></button>
                </td>
            `;
        });
    };

    const renderClubTable = (clubs) => {
        const tableBody = document.getElementById('club-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        clubs.forEach(club => {
             const teamCount = club.teamCount || 0;
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${club.clubName}</td>
                <td>${club.coachName ?? 'N/A'}</td>
                <td>${club.sports?.join(', ') ?? 'N/A'}</td>
                <td>${teamCount}</td>
                <td class="actions">
                    <button class="view-teams-btn" data-id="${club.id}" data-name="${club.clubName}" title="View Teams"><i class="fas fa-users"></i></button>
                    <button class="edit-btn" data-id="${club.id}" title="Edit Club"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" data-id="${club.id}" title="Delete Club"><i class="fas fa-trash"></i></button>
                </td>
            `;
        });
    };

     const renderTeamTable = (teams) => {
        const tableBody = document.getElementById('team-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        teams.forEach(team => {
            const playerCount = team.playerIds?.length ?? 0;
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${team.name}</td>
                <td>${team.category}</td>
                <td>${team.ageGroup}</td>
                <td>${playerCount}</td>
                 <td class="actions">
                     <button class="edit-btn" data-id="${team.id}" title="Edit Team"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" data-id="${team.id}" title="Delete Team"><i class="fas fa-trash"></i></button>
                </td>
            `;
        });
         document.getElementById('team-details-container').style.display = teams.length > 0 ? 'block' : 'none';
    };

     const renderArenaTable = (arenas) => {
        const tableBody = document.getElementById('arena-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        arenas.forEach(arena => {
             const facilityCount = arena.facilityCount || 0;
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${arena.arenaName}</td>
                <td>${arena.contactPersonName ?? 'N/A'}</td>
                 <td>${arena.address ?? 'N/A'}</td>
                <td>${facilityCount}</td>
                 <td class="actions">
                    <button class="view-facilities-btn" data-id="${arena.id}" data-name="${arena.arenaName}" title="View Facilities"><i class="fas fa-building"></i></button>
                    <button class="edit-btn" data-id="${arena.id}" title="Edit Arena"><i class="fas fa-edit"></i></button>
                    <button class="delete-btn" data-id="${arena.id}" title="Delete Arena"><i class="fas fa-trash"></i></button>
                </td>
            `;
        });
    };

     const renderFacilityTable = (facilities) => {
        const tableBody = document.getElementById('facility-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        facilities.forEach(facility => {
            const row = tableBody.insertRow();
             const statusClass = facility.status?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'default';
            row.innerHTML = `
                <td>${facility.name}</td>
                <td>${facility.type}</td>
                 <td class="actions">
                     <button class="edit-btn" data-id="${facility.id}" title="Edit Facility"><i class="fas fa-edit"></i></button>
                      <button class="status-btn" data-id="${facility.id}" data-current="${facility.status}" title="Update Status"><i class="fas fa-sync-alt"></i></button>
                    <button class="delete-btn" data-id="${facility.id}" title="Delete Facility"><i class="fas fa-trash"></i></button>
                </td>
            `;
        });
         document.getElementById('facility-details-container').style.display = facilities.length > 0 ? 'block' : 'none';
    };

    // --- New Function to Render Professional Balances Table ---
    const renderProfessionalBalanceTable = (professionals) => {
        const tableBody = document.getElementById('professional-balance-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        professionals.forEach(pro => {
            const row = tableBody.insertRow();
            // Correctly and safely access balance
            const balanceValue = pro.balance;
            const balance = (typeof balanceValue === 'number') ? balanceValue : 0.0;
            const formattedBalance = balance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); // Format as currency

            row.innerHTML = `
                <td>${pro.fullName || pro.businessName || pro.id}</td>
                <td>${pro.email || 'N/A'}</td>
                <td>${formattedBalance}</td>
                <td class="actions">
                    <button class="view-payout-info-btn" data-id="${pro.id}" data-name="${pro.fullName || pro.businessName || 'Professional'}" title="View Payout Info"><i class="fas fa-university"></i></button>
                    <button class="mark-paid-btn" data-id="${pro.id}" data-name="${pro.fullName || pro.businessName || 'Professional'}" data-balance="${balance}" title="Mark Balance as Paid" ${balance <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-money-check-alt"></i>
                    </button>
                </td>
            `;
        });
    };

    // --- New Function to Display Bank Details ---
    const displayPayoutInfo = (professionalName, payoutInfo) => {
        const container = document.getElementById('payout-info-container');
        const contentDiv = document.getElementById('payout-info-content');
        const nameSpan = document.getElementById('selected-professional-payout-name');
        if (!container || !contentDiv || !nameSpan) return;

        nameSpan.textContent = professionalName;

        if (!payoutInfo || Object.keys(payoutInfo).length === 0) {
            contentDiv.innerHTML = '<p><em>No bank details found for this professional.</em></p>'; // Keep message specific to bank details
        } else {
            // Format the details using the existing helper
            contentDiv.innerHTML = formatDataForDisplay(payoutInfo);
        }
        container.style.display = 'block';
    };

    const renderBookingTable = (bookings) => {
        const tableBody = document.getElementById('booking-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        bookings.forEach(booking => {
            const row = tableBody.insertRow();
             const statusClass = booking.status?.toLowerCase() || 'default';
             const facilityName = booking.facilityName || `Facility (${booking.facilityId.substring(0, 5)}...)`;
             const userName = booking.userName || `User (${booking.userId.substring(0, 5)}...)`;
            row.innerHTML = `
                <td>${facilityName}</td>
                 <td>${userName}</td>
                <td>${formatDateTime(booking.startTime)}</td>
                <td>${formatDateTime(booking.endTime)}</td>
                <td class="actions">
                    ${booking.status === 'pending' ? `<button class="status-btn" data-id="${booking.id}" data-status="confirmed" title="Confirm Booking"><i class="fas fa-check"></i></button>` : ''}
                    ${(booking.status === 'pending' || booking.status === 'confirmed') ? `<button class="status-btn" data-id="${booking.id}" data-status="cancelled" title="Cancel Booking"><i class="fas fa-times"></i></button>` : ''}
                </td>
            `;
        });
    };

    const renderConversationTable = (conversations) => {
        const tableBody = document.getElementById('conversation-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        conversations.forEach(conv => {
            const row = tableBody.insertRow();
            const title = conv.title || `Group (${conv.id.substring(0,5)}...)`;
            const type = conv.isEventChat ? 'Event' : (conv.activityId ? 'Activity' : (conv.participants?.length > 2 ? 'Group' : 'Direct'));
            row.innerHTML = `
                <td>${title}</td>
                 <td>${type}</td>
                <td>${conv.participants?.length ?? 0}</td>
                <td>${conv.lastMessage ?? 'N/A'}</td>
                 <td class="actions">
                    <button class="view-btn" data-id="${conv.id}" title="View Messages (Not Implemented)"><i class="fas fa-eye"></i></button>
                    <button class="delete-btn" data-id="${conv.id}" title="Delete Conversation"><i class="fas fa-trash"></i></button>
                 </td>
            `;
        });
    };


    // --- Data Loading Logic ---
    const loadSectionData = async (sectionId) => {
        console.log(`loadSectionData: Called for section: ${sectionId}`); // New Log
        // Display loading state in the relevant table
        const tableBody = document.querySelector(`#${sectionId} table tbody`);
        const boostedAnnouncementsListContainer = document.getElementById('boosted-announcements-list'); // Get the container for boosted announcements

        if (sectionId === 'boosted-announcements-management') {
            if (boostedAnnouncementsListContainer) {
                console.log("loadSectionData: Setting loading message for boosted-announcements-list.");
                boostedAnnouncementsListContainer.innerHTML = '<p class="loading-text">Loading announcements...</p>';
            } else {
                console.warn("loadSectionData: boosted-announcements-list container not found!");
            }
        } else if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="100%" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        }
        // Hide detail sections initially
        document.getElementById('team-details-container').style.display = 'none';
        document.getElementById('facility-details-container').style.display = 'none';

        try {
            // Reset pagination for new section
            currentPage = 1;
            lastVisibleDoc = null;

            let data, filters = [], sortBy = null, sortOrder = 'asc';

            // --- Apply Filters based on UI controls ---
             const userTypeFilter = document.getElementById('user-type-filter')?.value;
             const userSearch = document.getElementById('user-search')?.value;
             const activitySearch = document.getElementById('activity-search')?.value;
             const eventSearch = document.getElementById('event-search')?.value;
             const clubSearch = document.getElementById('club-search')?.value;
             const arenaSearch = document.getElementById('arena-search')?.value;
             const bookingSearch = document.getElementById('booking-search')?.value;
             const bookingStatusFilter = document.getElementById('booking-status-filter')?.value;
             const chatSearch = document.getElementById('chat-search')?.value;
             const proBalanceSearch = document.getElementById('pro-balance-search')?.value;

            console.log(`loadSectionData: Preparing to switch for sectionId: ${sectionId}`); // New Log
            switch (sectionId) {
                case 'dashboard-overview':
                     // Fetch counts for overview cards (Simplified - real app needs aggregation)
                    const usersSnap = await db.collection('users').limit(100).get(); // Estimate
                    const prosSnap = await db.collection('professionals').limit(100).get();
                    const clubsSnap = await db.collection('clubs').limit(100).get();
                    const arenasSnap = await db.collection('arenas').limit(100).get();
                    const activitiesSnap = await db.collection('activities').where('dateTime', '>', new Date()).limit(100).get();
                    const eventsSnap = await db.collection('events').where('dateTime', '>', new Date()).limit(100).get();
                    const reportsSnap = await db.collection('reports').where('status', '==', 'pending').limit(100).get();

                    document.getElementById('total-users').textContent = usersSnap.size + prosSnap.size + clubsSnap.size + arenasSnap.size;
                    document.getElementById('total-activities').textContent = activitiesSnap.size;
                    document.getElementById('total-events').textContent = eventsSnap.size;
                    document.getElementById('pending-reports').textContent = reportsSnap.size;
                    break;

                case 'user-management':
                    if (userTypeFilter && userTypeFilter !== 'all') {
                        filters.push({ field: 'userType', operator: '==', value: userTypeFilter });
                    }
                    if (userSearch) {
                        // Add a 'search' field to options for client-side filtering,
                        // as Firestore doesn't support partial text search well across multiple fields.
                        filters.push({ field: 'search', value: userSearch });
                    }
                    // Fetch combined users
                    const { users, lastDoc: userLastDoc, totalCount: userTotal } = await fetchUsers({ filters, startAfterDoc: lastVisibleDoc });
                    renderUserTable(users);
                    lastVisibleDoc = userLastDoc;
                    totalItems = userTotal;
                    currentCollection = 'users'; // Track collection for pagination
                    break;

                case 'activity-management':
                     if (activitySearch) filters.push({ field: 'name', operator: '>=', value: activitySearch }, { field: 'name', operator: '<=', value: activitySearch + '\uf8ff' });
                     sortBy = 'dateTime'; sortOrder = 'desc';
                     const { docs: activities, lastDoc: actLastDoc, totalCount: actTotal } = await fetchData('activities', { filters, sortBy, sortOrder, startAfterDoc: lastVisibleDoc });
                    renderActivityTable(activities);
                    lastVisibleDoc = actLastDoc;
                    totalItems = actTotal;
                    currentCollection = 'activities';
                    break;

                case 'event-management':
                     if (eventSearch) filters.push({ field: 'name', operator: '>=', value: eventSearch }, { field: 'name', operator: '<=', value: eventSearch + '\uf8ff' });
                     sortBy = 'dateTime'; sortOrder = 'desc';
                     const { docs: events, lastDoc: evtLastDoc, totalCount: evtTotal } = await fetchData('events', { filters, sortBy, sortOrder, startAfterDoc: lastVisibleDoc });
                    renderEventTable(events);
                     lastVisibleDoc = evtLastDoc;
                    totalItems = evtTotal;
                    currentCollection = 'events';
                    break;

                 case 'club-management':
                     if (clubSearch) filters.push({ field: 'clubName', operator: '>=', value: clubSearch }, { field: 'clubName', operator: '<=', value: clubSearch + '\uf8ff' });
                     sortBy = 'clubName';
                     const { docs: clubs, lastDoc: clubLastDoc, totalCount: clubTotal } = await fetchData('clubs', { filters, sortBy, startAfterDoc: lastVisibleDoc });
                     // We need team count - this requires extra queries or denormalization
                     // Simulating adding teamCount for now
                     const clubsWithCount = await Promise.all(clubs.map(async c => {
                         const teamsSnap = await db.collection('teams').where('clubId', '==', c.id).get();
                         return {...c, teamCount: teamsSnap.size };
                     }));
                     renderClubTable(clubsWithCount);
                     lastVisibleDoc = clubLastDoc;
                    totalItems = clubTotal;
                    currentCollection = 'clubs';
                    break;

                case 'arena-management':
                     if (arenaSearch) filters.push({ field: 'arenaName', operator: '>=', value: arenaSearch }, { field: 'arenaName', operator: '<=', value: arenaSearch + '\uf8ff' });
                     sortBy = 'arenaName';
                     const { docs: arenas, lastDoc: arenaLastDoc, totalCount: arenaTotal } = await fetchData('arenas', { filters, sortBy, startAfterDoc: lastVisibleDoc });
                      // We need facility count - this requires extra queries or denormalization
                     // Simulating adding facilityCount for now
                     const arenasWithCount = await Promise.all(arenas.map(async a => {
                         const facSnap = await db.collection('facilities').where('arenaId', '==', a.id).get();
                         return {...a, facilityCount: facSnap.size };
                     }));
                     renderArenaTable(arenasWithCount);
                     lastVisibleDoc = arenaLastDoc;
                     totalItems = arenaTotal;
                     currentCollection = 'arenas';
                     break;

                 case 'booking-management':
                     if (bookingSearch) filters.push({ field: 'search', value: bookingSearch }); // Needs backend/client-side logic
                     if (bookingStatusFilter && bookingStatusFilter !== 'all') {
                         filters.push({ field: 'status', operator: '==', value: bookingStatusFilter });
                     }
                     sortBy = 'startTime'; sortOrder = 'desc';
                     const { docs: bookings, lastDoc: bookLastDoc, totalCount: bookTotal } = await fetchData('facility_bookings', { filters, sortBy, sortOrder, startAfterDoc: lastVisibleDoc });
                     // Fetch facility/user names for better display
                     const populatedBookings = await Promise.all(bookings.map(async b => {
                         const facDoc = await db.collection('facilities').doc(b.facilityId).get();
                         const user = await getUserData(b.userId); // Use helper
                         return {
                             ...b,
                             facilityName: facDoc.exists ? facDoc.data()?.name : 'Unknown Facility',
                             userName: user?.fullName || user?.email || 'Unknown User'
                         };
                     }));
                     renderBookingTable(populatedBookings);
                      lastVisibleDoc = bookLastDoc;
                     totalItems = bookTotal;
                     currentCollection = 'facility_bookings';
                     break;

                case 'chat-management':
                     if (chatSearch) filters.push({ field: 'search', value: chatSearch }); // Client-side search
                     sortBy = 'lastMessageTimestamp'; sortOrder = 'desc';
                      const { docs: conversations, lastDoc: convLastDoc, totalCount: convTotal } = await fetchData('conversations', { filters, sortBy, sortOrder, startAfterDoc: lastVisibleDoc });
                     // Populate necessary display info (participants etc.) - could be complex
                      const populatedConvs = await Promise.all(conversations.map(async c => {
                           const type = c.isEventChat ? 'Event' : (c.activityId ? 'Activity' : (c.participants?.length > 2 ? 'Group' : 'Direct'));
                           // Fetch title if missing (for activity/event)
                           let title = c.title;
                           if (!title && (c.activityId || c.eventId)) {
                               const collection = c.eventId ? 'events' : 'activities';
                               const id = c.eventId || c.activityId;
                                try {
                                    const docSnap = await db.collection(collection).doc(id).get();
                                    if (docSnap.exists) title = docSnap.data()?.name;
                                } catch { /* ignore */ }
                           }
                           return { ...c, type: type, title: title };
                       }));

                       // Apply client-side search for participants if needed
                        let finalConvs = populatedConvs;
                       if (chatSearch) {
                            const query = chatSearch.toLowerCase();
                           // TODO: Fetch participant names if searching by participant, then filter
                            console.warn("Participant search in chat not fully implemented client-side");
                            finalConvs = populatedConvs.filter(c => c.title?.toLowerCase().includes(query));
                       }

                     renderConversationTable(finalConvs);
                      lastVisibleDoc = convLastDoc;
                     totalItems = convTotal;
                     currentCollection = 'conversations';
                     break;

                case 'professional-balances':
                    if (proBalanceSearch) {
                        // Implement search logic if needed - Firestore doesn't easily search multiple name fields
                        // Client-side filtering might be required after fetch, or use a dedicated search field
                        console.warn("Professional search not fully implemented based on name/email across types.");
                        // Example client-side filter (apply after fetch):
                        // filters.push({ field: 'search', value: proBalanceSearch });
                    }
                    sortBy = 'balance'; // Sort by balance maybe?
                    sortOrder = 'desc';
                    currentCollection = 'professionals';
                    const { docs: professionals, lastDoc: proLastDoc, totalCount: proTotal } = await fetchData(currentCollection, { filters, sortBy, sortOrder, startAfterDoc: lastVisibleDoc });

                    // // Example: Apply client-side search if needed
                    // let filteredPros = professionals;
                    // if (proBalanceSearch) {
                    //    const query = proBalanceSearch.toLowerCase();
                    //    filteredPros = professionals.filter(p =>
                    //       (p.fullName?.toLowerCase().includes(query) || false) ||
                    //       (p.businessName?.toLowerCase().includes(query) || false) ||
                    //       (p.email?.toLowerCase().includes(query) || false)
                    //    );
                    // }

                    renderProfessionalBalanceTable(professionals); // Render the filtered list
                    lastVisibleDoc = proLastDoc;
                    totalItems = proTotal; // Adjust if client-side filtering
                    document.getElementById('payout-info-container').style.display = 'none'; // Hide payout info initially
                    break;
                
                case 'boosted-announcements-management': // ADDED THIS CASE
                    console.log("loadSectionData: Case 'boosted-announcements-management' matched. Calling loadBoostedAnnouncementsData.");
                    await loadBoostedAnnouncementsData(); // Call the specific function
                    // Pagination for boosted announcements is not implemented yet, so we don't set currentCollection or totalItems here.
                    break;
            }
            updatePagination(currentCollection); // Update pagination controls

        } catch (error) {
            console.error(`Error loading data for ${sectionId}:`, error);
            const tableBody = document.querySelector(`#${sectionId} table tbody`);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="100%" style="text-align: center; padding: 20px; color: ${getComputedStyle(document.documentElement).getPropertyValue('--error-red')};">Error loading data. Please try again.</td></tr>`;
            }
            updatePagination(currentCollection); // Still update pagination (will show 0)
        }
    };

    // --- Pagination Logic ---
    const updatePagination = (collection) => {
        const paginationDiv = document.getElementById(`${collection}-pagination`);
        if (!paginationDiv) return;

        const totalPages = Math.ceil(totalItems / itemsPerPage);
        paginationDiv.innerHTML = ''; // Clear previous buttons

        if (totalPages <= 1) return; // No pagination needed for 1 or 0 pages

        // Previous Button
        const prevButton = document.createElement('button');
        prevButton.innerHTML = '« Prev';
        prevButton.disabled = currentPage === 1;
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                // Need `endBefore` logic for Firestore pagination - complex
                // Simpler: Reload the section, assuming fetch handles current page state
                 console.warn("Firestore 'previous page' pagination not fully implemented with startAfter/endBefore. Reloading current section.");
                 loadSectionData(getActiveSectionId()); // Reload current view
            }
        });
        paginationDiv.appendChild(prevButton);

        // Current Page Info
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
        paginationDiv.appendChild(pageInfo);

        // Next Button
        const nextButton = document.createElement('button');
        nextButton.innerHTML = 'Next »';
        nextButton.disabled = currentPage >= totalPages || !lastVisibleDoc; // Disable if on last page or no more docs indication
        nextButton.addEventListener('click', () => {
            if (currentPage < totalPages && lastVisibleDoc) {
                currentPage++;
                loadSectionData(getActiveSectionId()); // Reload data for the next page
            }
        });
        paginationDiv.appendChild(nextButton);
    };

    const getActiveSectionId = () => {
        const activeLink = document.querySelector('.sidebar-nav a.active');
        return activeLink ? activeLink.getAttribute('data-section') : 'dashboard-overview';
    }


    // --- Navigation ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.getAttribute('data-section');
            if (!sectionId) return;

            // Update active link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Update header title
            document.querySelector('.main-header h1').textContent = link.textContent.trim();

            // Show selected section, hide others
            contentSections.forEach(section => {
                section.classList.toggle('active', section.id === sectionId);
            });
            // Load data for the activated section
            loadSectionData(sectionId);
        });
    });

    // --- Modals ---
    const openModal = (modal) => modal.style.display = 'block';
    const closeModal = (modal) => {
        modal.style.display = 'none';
         // Reset forms inside modals when closed
        const form = modal.querySelector('form');
        if (form) form.reset();
        // Clear hidden IDs
        modal.querySelectorAll('input[type="hidden"]').forEach(input => input.value = '');
    };

    closeModalBtns.forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal'))));
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            closeModal(event.target);
        }
    });

    // --- CRUD Event Listeners (Using Event Delegation) ---
    if (mainContentArea) {
        mainContentArea.addEventListener('click', async (e) => {
            console.log('Click detected inside mainContentArea:', e.target, e.target.closest('button'));
            const targetButton = e.target.closest('button');
            if (!targetButton) return;

            const tableId = targetButton.closest('table')?.id;
            const id = targetButton.dataset.id;

            // --- Approve Professional Action ---
            if (targetButton.classList.contains('btn-approve') && id && tableId === 'user-table') {
                e.stopPropagation();
                console.log(`Approve button clicked for user ${id}`);
                showConfirmation('Confirm Approval', `Are you sure you want to approve professional ${id}?`, () => {
                    approveProfessionalUser(id);
                });
                return; // Stop further processing for this click
            }

            // --- View Professional Details Action ---
            if (targetButton.classList.contains('view-details-btn') && id && tableId === 'user-table') {
                e.stopPropagation();
                console.log(`View details button clicked for user ${id}`);
                
                // Find the user object from the currently rendered users list
                // Assumes 'users' variable is in scope from loadSectionData -> renderUserTable context
                let userForDetails = null;
                if (typeof users !== 'undefined' && Array.isArray(users)) { // Check if global/scoped users array exists
                    userForDetails = users.find(u => u.id === id);
                }

                if (userForDetails) {
                    const detailsHtml = populateProfessionalDetails(userForDetails);
                    showDetailsModal(`Professional Details: ${userForDetails.businessName || userForDetails.email}`, detailsHtml);
                } else {
                    // Fallback: If user object not found in current list, fetch it directly
                    // This is more robust if 'users' array isn't reliably in scope or complete
                    console.warn(`User ${id} not found in current list, fetching directly for details.`);
                    const fetchedUser = await getUserData(id); // getUserData fetches from any user collection
                    if (fetchedUser && fetchedUser.userType === 'professional') {
                        const detailsHtml = populateProfessionalDetails(fetchedUser);
                        showDetailsModal(`Professional Details: ${fetchedUser.businessName || fetchedUser.email}`, detailsHtml);
                    } else {
                        showDetailsModal('Error', '<p>Could not load professional details for this user.</p>');
                        console.error("Failed to fetch or invalid user type for details modal for user:", id);
                    }
                }
                return; 
            }

            // --- Existing View/Edit/Delete Actions ---
            // Ensure these do not conflict. If the 'view-btn' for non-professionals
            // has a different purpose, it will be handled by the existing logic below.

            // View Action (Generic - for non-professionals or if professional view-details-btn is not hit)
            if (targetButton.classList.contains('view-btn') && id) {
                 e.stopPropagation();
                console.log(`View button (generic) clicked for ${id}`);
                const user = await getUserData(id); // This fetches from any collection
                if (user) {
                    let contentHtml = '<h4>User Details</h4><dl class="row">';
                    for (const [key, value] of Object.entries(user)) {
                        let displayValue = value;
                        if (value && typeof value.toDate === 'function') { // Firestore Timestamp
                            displayValue = value.toDate().toLocaleString();
                        }
                        if (typeof value === 'object' && value !== null) {
                            displayValue = `<pre>${JSON.stringify(value, null, 2)}</pre>`;
                        }
                        contentHtml += `<dt class="col-sm-3 text-capitalize">${key.replace(/([A-Z])/g, ' $1')}</dt><dd class="col-sm-9">${displayValue}</dd>`;
                    }
                    contentHtml += '</dl>';
                    showDetailsModal(`Details for ${user.email || user.id}`, contentHtml);
                } else {
                    alert('Could not load user details.');
                }
                return;
            }

            // Edit Action
            if (targetButton.classList.contains('edit-btn') && id) {
                e.stopPropagation(); // Prevent potential parent handlers
                if (tableId === 'user-table') {
                    const user = await getUserData(id); // Fetch existing data
                    if (user) {
                        document.getElementById('user-modal-title').textContent = 'Edit User';
                        document.getElementById('user-id').value = id;
                        document.getElementById('user-name').value = user.fullName || user.businessName || user.clubName || user.arenaName || '';
                        document.getElementById('user-email').value = user.email || '';
                        document.getElementById('user-modal-type').value = user.userType || 'individual';
                        // TODO: Populate other fields based on user type
                        openModal(userModal);
                    } else { alert('User not found.'); }
                } else if (tableId === 'facility-table') {
                     const facilityRef = await db.collection('facilities').doc(id).get();
                     if (facilityRef.exists) {
                         const facility = { id: facilityRef.id, ...facilityRef.data() };
                         document.getElementById('facility-modal-title').textContent = 'Edit Facility';
                         document.getElementById('facility-id').value = id;
                         document.getElementById('facility-name').value = facility.name || '';
                         document.getElementById('facility-type').value = facility.type || '';
                         document.getElementById('facility-status').value = facility.status || 'Disponible';
                         document.getElementById('facility-description').value = facility.description || '';
                         document.getElementById('facility-arena-id').value = facility.arenaId || ''; // Preserve arena ID
                          // Populate other details if needed
                         openModal(facilityModal);
                     } else { alert('Facility not found.'); }
                }
                // Add similar logic for editing Activities, Events, Clubs, Teams, Arenas
                 else {
                     alert(`Edit action for this table (${tableId}) not fully implemented.`);
                 }
            }

            // --- View Actions --- New Section
            else if (targetButton.classList.contains('view-btn') && id) {
                e.stopPropagation();
                let title = 'Details';
                let contentHtml = '<p>Loading details...</p>';
                showDetailsModal(title, contentHtml); // Show loading state immediately

                try {
                    let data = null;
                    let formattedContent = '';

                    // Determine type and fetch data
                    if (tableId === 'user-table') {
                        data = await getUserData(id);
                        title = `User Details: ${data?.fullName || data?.email || id}`;
                    } else if (tableId === 'activity-table') {
                        const docSnap = await db.collection('activities').doc(id).get();
                        if (docSnap.exists) data = { id: docSnap.id, ...docSnap.data() };
                        title = `Activity Details: ${data?.name || id}`;
                    } else if (tableId === 'event-table') {
                        const docSnap = await db.collection('events').doc(id).get();
                        if (docSnap.exists) data = { id: docSnap.id, ...docSnap.data() };
                        title = `Event Details: ${data?.name || id}`;
                    } else if (tableId === 'club-table') {
                        const docSnap = await db.collection('clubs').doc(id).get();
                         if (docSnap.exists) data = { id: docSnap.id, ...docSnap.data() };
                         title = `Club Details: ${data?.clubName || id}`;
                    } else if (tableId === 'arena-table') {
                        const docSnap = await db.collection('arenas').doc(id).get();
                         if (docSnap.exists) data = { id: docSnap.id, ...docSnap.data() };
                        title = `Arena Details: ${data?.arenaName || id}`;
                    } else if (tableId === 'facility-table') {
                         const docSnap = await db.collection('facilities').doc(id).get();
                         if (docSnap.exists) data = { id: docSnap.id, ...docSnap.data() };
                         title = `Facility Details: ${data?.name || id}`;
                    } else if (tableId === 'conversation-table') {
                         const docSnap = await db.collection('conversations').doc(id).get();
                         if (docSnap.exists) data = { id: docSnap.id, ...docSnap.data() };
                         title = `Conversation Details: ${data?.title || id}`;
                    } else {
                        formattedContent = '<p>Viewing details for this item type is not implemented.</p>';
                    }

                    // Format data if found
                    if (data) {
                         // Use the new formatting function
                         formattedContent = formatDataForDisplay(data);
                    } else if (!formattedContent) { // If data fetch failed or type not handled
                        formattedContent = '<p>Could not load details.</p>';
                    }

                    // Update modal content
                    showDetailsModal(title, formattedContent);

                } catch (error) {
                    console.error("Error fetching details:", error);
                    showDetailsModal('Error', '<p>Could not load details due to an error.</p>');
                }
            }

            // --- Delete Actions ---
            else if (targetButton.classList.contains('delete-btn') && id) {
                e.stopPropagation();
                 let itemType = 'item';
                 let sectionToReload = getActiveSectionId(); // Default to current section

                 // Determine item type and potentially section to reload
                  if (tableId === 'user-table') itemType = 'user';
                 else if (tableId === 'activity-table') itemType = 'activity';
                 else if (tableId === 'event-table') itemType = 'event';
                 else if (tableId === 'club-table') itemType = 'club';
                 else if (tableId === 'team-table') itemType = 'team';
                 else if (tableId === 'arena-table') itemType = 'arena';
                 else if (tableId === 'facility-table') itemType = 'facility';
                 else if (tableId === 'conversation-table') itemType = 'conversation';

                showConfirmation(`Delete ${itemType}?`, `Are you sure you want to delete this ${itemType} (${id})? This cannot be undone.`, async () => {
                    let success = false;
                    let arenaIdToReloadFacilities = null; // Track if we need to reload facilities

                    switch (itemType) {
                        case 'user': success = await firebaseDeleteUser(id); break;
                        case 'activity': success = await firebaseDeleteActivity(id); break;
                        case 'event': success = await firebaseDeleteEvent(id); break;
                        case 'club': success = false; alert("Club deletion not implemented."); break; // Placeholder
                        case 'team': success = false; alert("Team deletion not implemented."); break; // Placeholder
                        case 'arena': success = false; alert("Arena deletion not implemented."); break; // Placeholder
                        case 'facility':
                             // Need arenaId to reload facilities after deleting one
                             const facilityDoc = await db.collection('facilities').doc(id).get();
                             if(facilityDoc.exists) arenaIdToReloadFacilities = facilityDoc.data()?.arenaId;
                             success = await firebaseDeleteFacility(id);
                            break;
                        case 'conversation': success = await firebaseDeleteConversation(id); break;
                        default: alert("Unknown item type for deletion."); return;
                    }

                    if (success) {
                         // If deleting a facility, reload just the facility list for that arena
                         if (itemType === 'facility' && arenaIdToReloadFacilities) {
                             const arenaNameSpan = document.getElementById('selected-arena-name');
                             loadFacilitiesForArena(arenaIdToReloadFacilities, arenaNameSpan?.textContent || 'Arena');
                         } else {
                             loadSectionData(sectionToReload); // Reload the main section table
                         }
                    } else {
                        alert(`Failed to delete ${itemType}.`);
                    }
                });
            }

            // --- Status Update Actions ---
             else if (targetButton.classList.contains('status-btn') && id) {
                 e.stopPropagation();
                 let itemType = '';
                 let options = {};
                 let currentData = {}; // To store current status values

                 if (tableId === 'user-table') {
                    itemType = 'user';
                    const userType = targetButton.dataset.type;
                    options = {}; // Start with empty options
                    currentData = {}; // No status data needed here anymore for users
                 } else if (tableId === 'activity-table') {
                     itemType = 'activity';
                     const isBoosted = targetButton.dataset.boosted === 'true';
                     options = {
                         [`boost_${!isBoosted}`]: { field: 'isBoosted', value: !isBoosted, text: `${!isBoosted ? 'Boost' : 'Remove Boost'}` }
                     };
                      currentData = { isBoosted };
                 } else if (tableId === 'facility-table') {
                     itemType = 'facility';
                     const currentStatus = targetButton.dataset.current;
                     const statuses = ['Disponible', 'Occupé', 'Maintenance'];
                     statuses.forEach(status => {
                         if (status !== currentStatus) {
                             options[`status_${status}`] = { field: 'status', value: status, text: `Set to ${status}` };
                         }
                     });
                      currentData = { status: currentStatus };
                 } else if (tableId === 'booking-table') {
                     itemType = 'booking';
                     const newStatus = targetButton.dataset.status; // 'confirmed' or 'cancelled'
                     showConfirmation(`Confirm Booking ${newStatus}?`, `Do you want to mark booking ${id} as ${newStatus}?`, async () => {
                         const success = await firebaseUpdateBookingStatus(id, newStatus);
                         if (success) loadSectionData('booking-management'); else alert('Failed to update booking.');
                     });
                     return; // Handled directly
                 }

                 if (Object.keys(options).length > 0) {
                     showStatusModal(`Update ${itemType} Status`, id, itemType, options);
                 } else {
                     console.log("No status actions available for this item/state.");
                 }
             }

            // --- View Teams/Facilities ---
             else if (targetButton.classList.contains('view-teams-btn') && id) {
                 e.stopPropagation();
                const clubName = targetButton.dataset.name || 'Club';
                loadTeamsForClub(id, clubName);
             } else if (targetButton.classList.contains('view-facilities-btn') && id) {
                 e.stopPropagation();
                 const arenaName = targetButton.dataset.name || 'Arena';
                loadFacilitiesForArena(id, arenaName);
             }

            // --- View Bank Details Action --- New
            else if (targetButton.classList.contains('view-payout-info-btn') && id) {
                e.stopPropagation();
                const professionalName = targetButton.dataset.name || 'Professional';
                const payoutInfoContainer = document.getElementById('payout-info-container');
                const payoutInfoContent = document.getElementById('payout-info-content');

                if (payoutInfoContainer) {
                    // Show loading state
                    document.getElementById('selected-professional-payout-name').textContent = professionalName;
                    if (payoutInfoContent) payoutInfoContent.innerHTML = '<p>Loading payout info...</p>';
                    payoutInfoContainer.style.display = 'block';

                    try {
                        // Fetch the professional document again to get bank details
                        const proDoc = await db.collection('professionals').doc(id).get();
                        let bankDetails = {}; // Still focusing on bank details here
                        if (proDoc.exists) {
                            const data = proDoc.data() || {};
                            // Extract only potential bank detail fields (adjust based on actual fields)
                            const relevantKeys = ['iban', 'bic', 'accountHolderName', 'bankName', 'bankAddress'];
                            for (const key of relevantKeys) {
                                if (data[key]) {
                                    bankDetails[key] = data[key];
                                }
                            }
                        } else {
                             console.warn(`Professional document ${id} not found when fetching bank details.`);
                        }
                        displayPayoutInfo(professionalName, bankDetails); // Call renamed function
                    } catch (error) {
                        console.error(`Error fetching bank details for ${id}:`, error);
                         if (payoutInfoContent) payoutInfoContent.innerHTML = '<p>Error loading bank details.</p>';
                    }
                } else {
                    console.error("Payout info container not found");
                }
            }
             // --- Mark Paid Action --- New
             else if (targetButton.classList.contains('mark-paid-btn') && id) {
                 e.stopPropagation();
                 const professionalName = targetButton.dataset.name || 'Professional';
                 const currentBalance = parseFloat(targetButton.dataset.balance || '0');
                 const formattedBalance = currentBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

                 if (currentBalance <= 0) {
                     alert('Balance is already zero or less. Cannot mark as paid.');
                     return;
                 }

                 showConfirmation(
                     `Confirm Payout for ${professionalName}?`,
                     `Are you sure you want to mark the balance of ${formattedBalance} as paid? This will set the professional's balance to 0.00 €. `,
                     async () => {
                         console.log(`Attempting to mark professional ${id} as paid.`);
                         const success = await firebaseMarkProfessionalPaid(id);
                         if (success) {
                             alert(`${professionalName} marked as paid. Their balance is now zero.`);
                             // Reload the section to reflect the change
                             loadSectionData('professional-balances');
                             // Optionally hide the payout info section if it was open
                             const payoutContainer = document.getElementById('payout-info-container');
                             if (payoutContainer) payoutContainer.style.display = 'none';
                         } else {
                             alert(`Failed to mark ${professionalName} as paid. Please check console for errors.`);
                         }
                     }
                 );
             }
             // Add other button handlers (view, specific actions) here
        });
    }

     // --- Status Form Submission ---
    if (statusForm) {
        statusForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const itemId = document.getElementById('status-item-id').value;
            const itemType = document.getElementById('status-item-type').value;
            const selectedOptionKey = document.getElementById('status-select').value; // This is the key like 'verify_true' or 'status_Reviewed'
            const selectElement = document.getElementById('status-select');
             const selectedOption = selectElement.options[selectElement.selectedIndex];
             const selectedValue = selectedOption.dataset.value; // Get the actual value ('true', 'false', 'reviewed')
             const fieldToUpdate = selectedOption.dataset.field; // Get the field name ('isVerified', 'status')


            let success = false;
            let sectionToReload = getActiveSectionId();
             let arenaIdForFacilityReload = null; // For facility status updates

            if (!fieldToUpdate || selectedValue === undefined) {
                 alert("Error: Could not determine field or value to update.");
                 return;
             }

             // Prepare data payload
             const updateData = {};
             // Convert string 'true'/'false' to boolean if necessary
             updateData[fieldToUpdate] = (selectedValue === 'true') ? true : (selectedValue === 'false' ? false : selectedValue);

            console.log(`Updating ${itemType} ${itemId}: Setting ${fieldToUpdate} to ${updateData[fieldToUpdate]}`);

            try {
                 switch (itemType) {
                    case 'user': success = await firebaseUpdateUser(itemId, updateData); break;
                    case 'activity': success = await firebaseUpdateActivity(itemId, updateData); break;
                    case 'facility':
                         const facilityDoc = await db.collection('facilities').doc(itemId).get();
                         if(facilityDoc.exists) arenaIdForFacilityReload = facilityDoc.data()?.arenaId;
                         success = await firebaseUpdateFacility(itemId, updateData);
                         break;
                    case 'arena': success = await firebaseUpdateUser(itemId, updateData); break; // Assuming approval on user doc
                 }

                 if (success) {
                     closeModal(statusModal);
                      // Reload relevant section
                      if (itemType === 'facility' && arenaIdForFacilityReload) {
                          loadFacilitiesForArena(arenaIdForFacilityReload, document.getElementById('selected-arena-name')?.textContent || 'Arena');
                      } else {
                          loadSectionData(sectionToReload);
                      }
                 } else {
                     alert('Failed to update status.');
                 }
            } catch (error) {
                 alert(`Error updating status: ${error}`);
            }
        });
    }


    // --- Helper Functions ---

    const showConfirmation = (title, message, onConfirm) => {
         document.getElementById('confirmation-title').textContent = title;
         document.getElementById('confirmation-message').textContent = message;
         const confirmBtn = document.getElementById('confirm-action-btn');
         const cancelBtn = document.getElementById('cancel-confirmation-btn');

         const newConfirmBtn = confirmBtn.cloneNode(true);
         confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
         const newCancelBtn = cancelBtn.cloneNode(true);
         cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

         newConfirmBtn.addEventListener('click', () => {
             closeModal(confirmationModal);
             onConfirm();
         }, { once: true });
         newCancelBtn.addEventListener('click', () => closeModal(confirmationModal), { once: true });

         openModal(confirmationModal);
     };

     const showStatusModal = (title, itemId, itemType, options) => {
         document.getElementById('status-modal-title').textContent = title;
         document.getElementById('status-item-id').value = itemId;
         document.getElementById('status-item-type').value = itemType;
         const select = document.getElementById('status-select');
         select.innerHTML = ''; // Clear previous options

          if (Object.keys(options).length === 0) {
              const noOption = document.createElement('option');
              noOption.textContent = "No actions available";
              noOption.disabled = true;
              select.appendChild(noOption);
              select.nextElementSibling.disabled = true; // Disable save button
          } else {
               select.nextElementSibling.disabled = false; // Enable save button
              for (const [key, optionData] of Object.entries(options)) {
                  const optionElement = document.createElement('option');
                  optionElement.value = key; // Key identifies the action (e.g., 'verify_true')
                  optionElement.textContent = optionData.text; // User-friendly text
                  optionElement.dataset.field = optionData.field; // Store field name
                  optionElement.dataset.value = optionData.value.toString(); // Store actual value
                  select.appendChild(optionElement);
              }
          }

         openModal(statusModal);
     };

    // Function to load and render teams for a specific club
    const loadTeamsForClub = async (clubId, clubName) => {
        document.getElementById('selected-club-name').textContent = clubName;
        const teamTableBody = document.getElementById('team-table')?.querySelector('tbody');
        if (teamTableBody) teamTableBody.innerHTML = '<tr><td colspan="5">Loading teams...</td></tr>';

        try {
           const teams = await fetchTeamsFromFirestore(clubId); // Fetch specific teams
           renderTeamTable(teams);
        } catch (error) {
             console.error(`Error loading teams for club ${clubId}:`, error);
             if (teamTableBody) teamTableBody.innerHTML = '<tr><td colspan="5">Error loading teams.</td></tr>';
        }
         document.getElementById('team-details-container').style.display = 'block';
    };

     // Function to load and render facilities for a specific arena
    const loadFacilitiesForArena = async (arenaId, arenaName) => {
        document.getElementById('selected-arena-name').textContent = arenaName;
         document.getElementById('add-facility-btn').dataset.arenaId = arenaId; // Update Add button context
        const facilityTableBody = document.getElementById('facility-table')?.querySelector('tbody');
        if (facilityTableBody) facilityTableBody.innerHTML = '<tr><td colspan="4">Loading facilities...</td></tr>';

        try {
           const facilities = await fetchFacilitiesFromFirestore(arenaId);
           renderFacilityTable(facilities);
        } catch (error) {
             console.error(`Error loading facilities for arena ${arenaId}:`, error);
             if (facilityTableBody) facilityTableBody.innerHTML = '<tr><td colspan="4">Error loading facilities.</td></tr>';
        }
         document.getElementById('facility-details-container').style.display = 'block';
    };

     // --- Filter/Search Event Listeners ---
      document.getElementById('user-type-filter')?.addEventListener('change', () => { currentPage = 1; lastVisibleDoc = null; loadSectionData('user-management'); });
      document.getElementById('user-search')?.addEventListener('input', () => { currentPage = 1; lastVisibleDoc = null; loadSectionData('user-management'); }); // Basic debounce might be needed
      document.getElementById('activity-search')?.addEventListener('input', () => { currentPage = 1; lastVisibleDoc = null; loadSectionData('activity-management'); });
      document.getElementById('event-search')?.addEventListener('input', () => { currentPage = 1; lastVisibleDoc = null; loadSectionData('event-management'); });
      document.getElementById('club-search')?.addEventListener('input', () => { currentPage = 1; lastVisibleDoc = null; loadSectionData('club-management'); });
      document.getElementById('arena-search')?.addEventListener('input', () => { currentPage = 1; lastVisibleDoc = null; loadSectionData('arena-management'); });
      document.getElementById('booking-search')?.addEventListener('input', () => { currentPage = 1; lastVisibleDoc = null; loadSectionData('booking-management'); });
      document.getElementById('booking-status-filter')?.addEventListener('change', () => { currentPage = 1; lastVisibleDoc = null; loadSectionData('booking-management'); });
      document.getElementById('chat-search')?.addEventListener('input', () => { currentPage = 1; lastVisibleDoc = null; loadSectionData('chat-management'); });
      document.getElementById('pro-balance-search')?.addEventListener('input', () => { currentPage = 1; lastVisibleDoc = null; loadSectionData('professional-balances'); }); // Add listener for new search


    // --- Initial Load ---
    loadSectionData('dashboard-overview'); // Load overview data initially

    // --- Helper Function to format data for modal display ---
    const formatDataForDisplay = (data) => {
        if (!data || typeof data !== 'object') {
            return '<p>No data to display or invalid data format.</p>';
        }

        let html = '';
        for (const key in data) {
            if (Object.hasOwnProperty.call(data, key)) {
                let value = data[key];
                let displayValue = '';

                // Format specific types nicely
                if (value && value.toDate) { // Firestore Timestamp
                    displayValue = value.toDate().toLocaleString();
                } else if (value instanceof Date) { // Javascript Date
                    displayValue = value.toLocaleString();
                } else if (Array.isArray(value)) {
                    if (value.length === 0) {
                        displayValue = '<em>(empty list)</em>';
                    } else if (value.every(item => typeof item === 'string' || typeof item === 'number')) {
                        displayValue = value.join(', '); // Simple array to comma-separated string
                    } else {
                        // Array of objects or mixed types: display as JSON
                        displayValue = `<pre>${JSON.stringify(value, null, 2)}</pre>`;
                    }
                } else if (typeof value === 'object' && value !== null) {
                     // Nested object: display as JSON for now
                    displayValue = `<pre>${JSON.stringify(value, null, 2)}</pre>`;
                } else if (typeof value === 'boolean') {
                    displayValue = value ? 'Yes' : 'No';
                } else if (value === null || value === undefined || value === '') {
                    displayValue = '<em>N/A</em>';
                } else {
                    displayValue = value.toString(); // Default to string
                }

                // Create readable key (e.g., 'userType' -> 'User Type')
                const readableKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

                html += `<p><strong>${readableKey}:</strong> ${displayValue}</p>`;
            }
        }
        return html || '<p>No data properties found.</p>';
    };

    // --- Helper Function to show Details Modal ---
    const showDetailsModal = (title, contentHtml) => {
        if (!detailsModal) return;
        document.getElementById('details-modal-title').textContent = title;
        document.getElementById('details-modal-content').innerHTML = contentHtml;
        openModal(detailsModal);
    };

    const firebaseDeleteEvent = async (eventId) => {
        console.log(`Deleting event ${eventId}`);
        const eventRef = db.collection('events').doc(eventId);
        try {
            // WARNING: This only deletes the event document itself.
            // Associated data like chats or reports might be orphaned.
            // Use Cloud Functions for proper cleanup in production.
            await eventRef.delete();
            console.log(`Deleted event ${eventId}`);
            return true;
        } catch (error) {
            console.error("Error deleting event:", error);
            return false;
        }
    };

    // --- Function to Fetch Teams for a Specific Club ---
    const fetchTeamsFromFirestore = async (clubId) => {
        console.log(`Fetching teams for club ${clubId}`);
        if (!clubId) return []; // Return empty if no clubId

        try {
            const teamsSnap = await db.collection('teams')
                                     .where('clubId', '==', clubId)
                                     .get();
            const teams = teamsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Found ${teams.length} teams for club ${clubId}`);
            return teams;
        } catch (error) {
            console.error(`Error fetching teams for club ${clubId}:`, error);
            throw error; // Re-throw the error to be caught by the caller
        }
    };

    // --- Function to Fetch Facilities for a Specific Arena ---
    const fetchFacilitiesFromFirestore = async (arenaId) => {
        console.log(`Fetching facilities for arena ${arenaId}`);
        if (!arenaId) return []; // Return empty if no arenaId

        try {
            const facilitiesSnap = await db.collection('facilities')
                                          .where('arenaId', '==', arenaId)
                                          .get();
            const facilities = facilitiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Found ${facilities.length} facilities for arena ${arenaId}`);
            return facilities;
        } catch (error) {
            console.error(`Error fetching facilities for arena ${arenaId}:`, error);
            throw error; // Re-throw the error to be caught by the caller
        }
    };

    // --- New Firebase function to mark as paid ---
    const firebaseMarkProfessionalPaid = async (professionalId) => {
        console.log(`Marking professional ${professionalId} as paid (setting balance to 0)`);
        if (!professionalId) return false;
        const proRef = db.collection('professionals').doc(professionalId);
        try {
            await proRef.update({ balance: 0 });
            console.log(`Successfully set balance to 0 for professional ${professionalId}`);
            return true;
        } catch (error) {
            console.error(`Error updating balance for professional ${professionalId}:`, error);
            return false;
        }
    };

    const approveProfessionalUser = async (userId) => {
        console.log(`Attempting to approve professional user: ${userId}`);
        const professionalRef = db.collection('professionals').doc(userId);
        try {
            await professionalRef.update({
                isApproved: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp() // Use server timestamp
            });
            console.log(`Successfully approved professional user: ${userId}`);
            // Reload user data for the section to reflect changes
            // Ensure the current page and filters are respected
            currentPage = 1; // Reset to first page of professionals to see the updated one easily
            lastVisibleDoc = null;
            loadSectionData('user-management'); 
            showSnackbar('User approved successfully!', 'success');
            return true;
        } catch (error) {
            console.error(`Error approving professional user ${userId}:`, error);
            showSnackbar('Error approving user. See console for details.', 'error');
            return false;
        }
    };

    const populateProfessionalDetails = (user) => { // Removed detailsContainer argument
        console.log("Generating details HTML for:", user);
        let detailsHtml = '<div class="details-grid">';
        
        const formatDateForDetails = (timestamp) => {
            if (!timestamp) return 'N/A';
            if (timestamp.toDate) { // Firestore Timestamp object
                return timestamp.toDate().toLocaleString();
            }
            // Check if it might be a string date from older data or direct input
            const date = new Date(timestamp);
            if (!isNaN(date.valueOf())) { // Check if it's a valid date
                 return date.toLocaleString();
            }
            return timestamp.toString(); // Fallback if not a recognizable date/timestamp
        };

        detailsHtml += `<div class="detail-item"><strong>Email:</strong> ${user.email || 'N/A'}</div>`;
        detailsHtml += `<div class="detail-item"><strong>APE Code:</strong> ${user.apeCode || 'N/A'}</div>`;
        detailsHtml += `<div class="detail-item"><strong>Business Type:</strong> ${user.businessType || 'N/A'}</div>`;
        detailsHtml += `<div class="detail-item"><strong>Phone:</strong> ${user.phoneNumber || 'N/A'}</div>`;
        detailsHtml += `<div class="detail-item"><strong>Sport Activity:</strong> ${user.sportActivity || 'N/A'}</div>`;
        detailsHtml += `<div class="detail-item"><strong>KBIS Number:</strong> ${user.kbisNumber || 'N/A'}</div>`;
        detailsHtml += `<div class="detail-item"><strong>Verified:</strong> <span class="status-badge status-${user.isVerified === true ? 'active' : 'inactive'}">${user.isVerified === true ? 'Yes' : 'No'}</span></div>`;
        detailsHtml += `<div class="detail-item"><strong>Approved:</strong> <span class="status-badge status-${user.isApproved === true ? 'active' : 'pending'}">${user.isApproved === true ? 'Yes' : 'No'}</span></div>`;
        detailsHtml += `<div class="detail-item"><strong>Joined:</strong> ${formatDateForDetails(user.createdAt)}</div>`;
        detailsHtml += `<div class="detail-item"><strong>Last Updated:</strong> ${formatDateForDetails(user.updatedAt)}</div>`;

        if (user.kbisFileUrl) {
            detailsHtml += `<div class="detail-item full-width"><strong>KBIS Document:</strong> <a href="${user.kbisFileUrl}" target="_blank" class="link-primary">View KBIS</a></div>`;
        }
        if (user.diplomaFileUrls && user.diplomaFileUrls.length > 0) {
            detailsHtml += '<div class="detail-item full-width"><strong>Diplomas/Certifications:</strong><ul>';
            user.diplomaFileUrls.forEach((url, index) => {
                detailsHtml += `<li><a href="${url}" target="_blank" class="link-primary">View Diploma ${index + 1}</a></li>`;
            });
            detailsHtml += '</ul></div>';
        } else {
            detailsHtml += '<div class="detail-item full-width"><strong>Diplomas/Certifications:</strong> <em>None provided</em></div>';
        }
        detailsHtml += '</div>'; // End of details-grid
        return detailsHtml; // Return the HTML string
    };

    // --- Boosted Announcements Management --- (NEW SECTION)
    const boostedAnnouncementsList = document.getElementById('boosted-announcements-list');
    // const boostedCreatorTypeFilter = document.getElementById('boosted-creator-type-filter'); // Commented out/Removed
    const boostedActivitySearch = document.getElementById('boosted-activity-search');
    // Add pagination elements if needed, similar to other sections

    async function fetchCreatorDetails(creatorId, creatorType) {
        if (!creatorId || !creatorType) return 'Unknown Creator'; // Default for missing basic info
        try {
            let docRef;
            let collectionName = '';
            if (creatorType === 'professional') {
                collectionName = 'professionals';
                docRef = db.collection(collectionName).doc(creatorId);
            } else if (creatorType === 'club') {
                collectionName = 'clubs';
                docRef = db.collection(collectionName).doc(creatorId);
            } else if (creatorType === 'individual') {
                collectionName = 'users'; // Assuming general users collection for individuals
                docRef = db.collection(collectionName).doc(creatorId);
            } else {
                return `Unknown Creator Type (${creatorType})`; // More specific unknown
            }
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                return data.businessName || data.clubName || data.name || data.fullName || data.email || `ID: ${creatorId}`; // Default to ID if no name field
            } else {
                return `Creator (ID: ${creatorId}, Type: ${creatorType}) Not Found`; // More specific not found
            }
        } catch (error) {
            console.error(`Error fetching creator details for ${creatorType} ${creatorId}:`, error);
            return `Error Fetching Creator (ID: ${creatorId})`; // More specific error
        }
    }

    async function renderBoostedAnnouncementCard(activity) {
        const card = document.createElement('div');
        card.classList.add('boosted-announcement-card');
        
        const rawCreatorName = await fetchCreatorDetails(activity.creatorId, activity.creatorType);
        const expiryDate = activity.boostExpiryDate && activity.boostExpiryDate.toDate ? formatDate(activity.boostExpiryDate.toDate()) : 'N/A';
        
        let statusText = 'Inactive';
        let statusColor = 'var(--dark-secondary-text)'; // Default color for inactive
        if (activity.boostExpiryDate && activity.boostExpiryDate.toDate && activity.boostExpiryDate.toDate() > new Date()) {
            statusText = 'Active';
            statusColor = 'var(--primary-green)'; // Green for active
        } else if (activity.boostExpiryDate) {
            statusText = 'Expired';
            statusColor = 'var(--accent-amber)'; // Amber for expired
        }

        let creatorInfoHtml = '';
        // Check if rawCreatorName indicates a problem (more robust checks)
        const isProblematicCreatorName = 
            rawCreatorName.includes('Not Found') || 
            rawCreatorName.includes('Error Fetching Creator') ||
            rawCreatorName.startsWith('Unknown Creator');

        if (!isProblematicCreatorName) {
            creatorInfoHtml = `<p class="creator-info">By: <strong>${rawCreatorName}</strong> (${activity.creatorType || 'N/A'})</p>`;
        } else {
            // Optionally log that problematic creator name was handled, or display a very generic placeholder if needed
            console.warn(`Hiding problematic creator details for activity ${activity.id}: ${rawCreatorName}`);
        }

        card.innerHTML = `
            <div class="banner-card-image">
                ${activity.photoUrl ? `<img src="${activity.photoUrl}" alt="${activity.name || 'Activity Image'}">` : '<i class="fas fa-image placeholder-icon"></i>'}
                <span class="ad-tag">AD</span>
            </div>
            <div class="banner-card-content">
                <h4>${activity.name || 'Unnamed Activity'}</h4>
                ${creatorInfoHtml} {/* This will be empty if creator name is problematic */}
                <p class="activity-type">Type: ${activity.type || 'N/A'}</p>
                <p class="boost-expiry">Expires: ${expiryDate}</p>
                <p class="boost-status" style="color: ${statusColor};">Status: <strong>${statusText}</strong></p>
            </div>
            <div class="banner-card-actions">
                <button class="btn btn-secondary btn-small view-activity-details-btn" data-id="${activity.id}" title="View Activity Details">View Activity</button>
                ${statusText === 'Active' ? `<button class="btn btn-danger btn-small deactivate-boost-btn" data-id="${activity.id}" title="Deactivate Boost">Deactivate</button>` : ''}
            </div>
        `;
        
        // Event listeners for action buttons (ensure these functions exist or are placeholders)
        const viewDetailsBtn = card.querySelector('.view-activity-details-btn');
        if (viewDetailsBtn) {
            viewDetailsBtn.addEventListener('click', () => {
                // Placeholder or actual implementation for viewActivityDetails(activity.id)
                console.log('View details clicked for activity ID:', activity.id);
                showDetailsModal(`Activity: ${activity.name || activity.id}`, formatDataForDisplay(activity));
            });
        }

        if (statusText === 'Active') {
            const deactivateBtn = card.querySelector('.deactivate-boost-btn');
            if (deactivateBtn) {
                deactivateBtn.addEventListener('click', () => {
                    // Placeholder or actual implementation for deactivateBoost(activity.id)
                    console.log('Deactivate boost clicked for activity ID:', activity.id);
                    showConfirmation(
                        'Deactivate Boost?',
                        `Are you sure you want to deactivate the boost for "${activity.name || activity.id}"?`,
                        async () => {
                            try {
                                await db.collection('activities').doc(activity.id).update({
                                    isBoosted: false,
                                    // boostExpiryDate: firebase.firestore.FieldValue.delete() // Or set to null/past date
                                });
                                console.log(`Boost deactivated for activity ${activity.id}`);
                                showSnackbar('Boost deactivated successfully.', 'success');
                                loadBoostedAnnouncementsData(); // Refresh the list
                            } catch (err) {
                                console.error('Error deactivating boost:', err);
                                showSnackbar('Error deactivating boost. See console.', 'error');
                            }
                        }
                    );
                });
            }
        }
        return card;
    }

    async function loadBoostedAnnouncementsData() {
        if (!boostedAnnouncementsList) {
            console.log("Boosted announcements list element not found. Exiting.");
            return;
        }
        console.log("loadBoostedAnnouncementsData: Setting loading message.");
        boostedAnnouncementsList.innerHTML = '<p class="loading-text">Loading boosted announcements...</p>';

        try {
            console.log("loadBoostedAnnouncementsData: Attempting to fetch boosted activities from Firestore.");
            const activitiesSnapshot = await db.collection('activities')
                .where('isBoosted', '==', true)
                .orderBy('boostExpiryDate', 'desc')
                .get();
            console.log(`loadBoostedAnnouncementsData: Fetched ${activitiesSnapshot.docs.length} boosted activities from Firestore.`);

            const allActivities = activitiesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const searchTerm = boostedActivitySearch ? boostedActivitySearch.value.toLowerCase() : '';
            console.log(`loadBoostedAnnouncementsData: Search term is '${searchTerm}'.`);

            let filteredActivities = allActivities;

            if (searchTerm) {
                console.log("loadBoostedAnnouncementsData: Applying search filter.");
                filteredActivities = filteredActivities.filter(act =>
                    act.name.toLowerCase().includes(searchTerm) ||
                    (act.creatorId && act.creatorId.toLowerCase().includes(searchTerm)) ||
                    (act.creatorName && act.creatorName.toLowerCase().includes(searchTerm))
                );
                console.log(`loadBoostedAnnouncementsData: Found ${filteredActivities.length} activities after search filter.`);
            }

            if (filteredActivities.length === 0) {
                console.log("loadBoostedAnnouncementsData: No filtered activities. Setting 'no announcements' message.");
                boostedAnnouncementsList.innerHTML = '<p>No boosted announcements found matching your criteria.</p>';
                return;
            }

            console.log(`loadBoostedAnnouncementsData: About to render ${filteredActivities.length} activity cards.`);
            boostedAnnouncementsList.innerHTML = ''; // Clear loading text before loop

            for (let i = 0; i < filteredActivities.length; i++) {
                const activity = filteredActivities[i];
                console.log(`loadBoostedAnnouncementsData: Rendering card ${i + 1} of ${filteredActivities.length} for activity ID ${activity.id}`);
                try {
                    const card = await renderBoostedAnnouncementCard(activity);
                    boostedAnnouncementsList.appendChild(card);
                    console.log(`loadBoostedAnnouncementsData: Successfully appended card for activity ID ${activity.id}`);
                } catch (renderError) {
                    console.error(`Error rendering card for activity ${activity.id} (name: ${activity.name || 'N/A'}):`, renderError);
                    const errorCardMsg = document.createElement('p');
                    errorCardMsg.textContent = `Error loading card for: ${activity.name || activity.id}. Check console.`;
                    errorCardMsg.className = 'error-text';
                    boostedAnnouncementsList.appendChild(errorCardMsg);
                }
            }
            console.log("loadBoostedAnnouncementsData: Finished rendering all cards.");
            // TODO: Implement pagination if necessary
        } catch (error) {
            console.error("loadBoostedAnnouncementsData: CATCH BLOCK HIT - Main error loading boosted announcements: ", error);
            boostedAnnouncementsList.innerHTML = '<p class="error-text">Error loading announcements. Please try again. Check console for details.</p>';
        }
    }

    // --- Event Listeners for Boosted Announcements section ---
    // if (boostedCreatorTypeFilter) { // REMOVED BLOCK
    //     boostedCreatorTypeFilter.addEventListener('change', loadBoostedAnnouncementsData);
    // }
    if (boostedActivitySearch) {
        boostedActivitySearch.addEventListener('input', () => {
            // Debounce search or load on enter for better performance
            loadBoostedAnnouncementsData(); 
        });
    }

    // --- Modify existing navigation logic to include this section ---
    // This assumes navLinks and contentSections are already defined and used in a loop
    // Example of how it might be integrated into existing nav logic:
    document.addEventListener('DOMContentLoaded', () => {
        // ... other initializations ...

        const navLinks = document.querySelectorAll('.sidebar-nav a.nav-link');
        const contentSections = document.querySelectorAll('.content-section');
        const mainHeaderTitle = document.querySelector('.main-header h1');

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navLinks.forEach(l => l.classList.remove('active'));
                contentSections.forEach(s => s.classList.remove('active'));

                link.classList.add('active');
                const sectionId = link.getAttribute('data-section');
                const activeSection = document.getElementById(sectionId);
                if (activeSection) activeSection.classList.add('active');
                if (mainHeaderTitle) mainHeaderTitle.textContent = link.textContent.trim();

                // Call specific load functions for sections
                if (sectionId === 'user-management') loadUsersData(); // Assuming loadUsersData exists
                else if (sectionId === 'activity-management') loadActivitiesData();  // Assuming loadActivitiesData exists
                else if (sectionId === 'event-management') loadEventsData(); // Assuming loadEventsData exists
                else if (sectionId === 'club-management') loadClubsData(); // Assuming loadClubsData exists
                else if (sectionId === 'arena-management') loadArenasData(); // Assuming loadArenasData exists
                else if (sectionId === 'booking-management') loadBookingsData(); // Assuming loadBookingsData exists
                else if (sectionId === 'professional-balances') loadProfessionalBalancesData(); // Assuming loadProfessionalBalancesData exists
                else if (sectionId === 'chat-management') loadChatsData(); // Assuming loadChatsData exists
                else if (sectionId === 'boosted-announcements-management') loadBoostedAnnouncementsData(); 
                // ... other sections ...
                else if (sectionId === 'dashboard-overview') loadDashboardOverviewData(); // Assuming loadDashboardOverviewData exists
            });
        });

        // Trigger click on the default active link (e.g., dashboard) to load its data if not already handled
        const defaultActiveLink = document.querySelector('.sidebar-nav a.nav-link.active');
        if (defaultActiveLink) { // Simplified initial load trigger
            const sectionId = defaultActiveLink.getAttribute('data-section');
            // Simplified logic: just check the sectionId for relevant load functions
            if (sectionId === 'dashboard-overview' && typeof loadDashboardOverviewData === 'function') loadDashboardOverviewData();
            else if (sectionId === 'user-management' && typeof loadUsersData === 'function') loadUsersData();
            else if (sectionId === 'activity-management' && typeof loadActivitiesData === 'function') loadActivitiesData();
            else if (sectionId === 'event-management' && typeof loadEventsData === 'function') loadEventsData();
            else if (sectionId === 'club-management' && typeof loadClubsData === 'function') loadClubsData();
            else if (sectionId === 'arena-management' && typeof loadArenasData === 'function') loadArenasData();
            else if (sectionId === 'booking-management' && typeof loadBookingsData === 'function') loadBookingsData();
            else if (sectionId === 'professional-balances' && typeof loadProfessionalBalancesData === 'function') loadProfessionalBalancesData();
            else if (sectionId === 'chat-management' && typeof loadChatsData === 'function') loadChatsData();
            else if (sectionId === 'boosted-announcements-management') loadBoostedAnnouncementsData();
             // Add other specific load functions here if they exist
        } else {
             // Fallback if no link is active by default, load overview
            if (typeof loadDashboardOverviewData === 'function') loadDashboardOverviewData();
        }
        // ... other initializations ...
    });

    // Ensure db is initialized (assuming it's done elsewhere, e.g., in firebase-init.js or at the top)
    // if (typeof db === 'undefined') { const db = firebase.firestore(); }

    // Add placeholder functions for actions (to be implemented later)
    // function viewActivityDetails(activityId) { console.log('View details for:', activityId); /* Show modal or navigate */ }
    // function deactivateBoost(activityId) { console.log('Deactivate boost for:', activityId); /* Update Firestore */ }

});

function showSnackbar(message, type = 'info') {
    const snackbar = document.createElement('div');
    snackbar.className = `snackbar show ${type}`;
    snackbar.textContent = message;
    document.body.appendChild(snackbar);
    setTimeout(() => {
        snackbar.className = snackbar.className.replace("show", "");
        document.body.removeChild(snackbar);
    }, 3000);
}
