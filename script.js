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

    // Selectors for Reported Ad Details Modal
    const reportedAdDetailsModal = document.getElementById('reported-ad-details-modal');
    const reportedAdInfoDiv = document.getElementById('reported-ad-info');
    const reportedAdReasonsListDiv = document.getElementById('reported-ad-reasons-list');
    const deleteAdBtnInModal = document.getElementById('delete-ad-btn');
    // Add other element selectors from the new modal as needed, e.g., spans for details
    const detailAdIdSpan = document.getElementById('detail-ad-id');
    const detailAdNameSpan = document.getElementById('detail-ad-name');
    const detailAdCreatorIdSpan = document.getElementById('detail-ad-creator-id');
    const detailAdReportCountSpan = document.getElementById('detail-ad-report-count');

    // Selectors for Sports Management
    const addSportBtn = document.getElementById('add-sport-btn');
    const newSportNameInput = document.getElementById('new-sport-name');

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
        const { filters = [], startAfterDoc = null, limitCount = itemsPerPage, fetchOnlyPending = false } = options;
        const userTypeFilterValue = filters.find(f => f.field === 'userType')?.value;
        const userSearchQuery = filters.find(f => f.field === 'search')?.value?.toLowerCase();

        if (fetchOnlyPending) {
            console.log(`Fetching ALL PENDING users. Options:`, options);
            const pendingCollections = ['professionals', 'clubs', 'arenas'];
            let allPendingUsers = [];
            let lastFetchedDoc = null; // This will be tricky for true pagination across multiple queries
            let totalPendingCount = 0;

            for (const col of pendingCollections) {
                let pendingQuery = db.collection(col)
                    .where('isApproved', '==', false)
                    .where('isVerified', '==', true) // Assuming pending users must be verified
                    // .orderBy('updatedAt', 'desc'); // Or 'createdAt', consistent across collections <-- REMOVED THIS LINE

                // Note: Firestore pagination (startAfterDoc) is complex with multiple queries.
                // For simplicity in this tab, we might fetch all or implement client-side pagination for the combined list.
                // Or, if the number of pending users is generally small, fetch all.
                // For now, we will fetch up to a larger limit per collection and combine.
                // A more robust solution might need a dedicated Cloud Function or separate fetches per type if counts are large.

                // Let's fetch a moderate number from each and combine. True server-side pagination is hard here.
                // We'll ignore startAfterDoc for combined pending fetches for now, and rely on limitCount or a fixed larger fetch.
                // This might mean pagination for the combined pending list is simpler (e.g. client-side if total is manageable)
                // or just shows the first N results.

                const snapshot = await pendingQuery.limit(limitCount * 3).get(); // Fetch more initially, up to 3x itemsPerPage
                snapshot.docs.forEach(doc => {
                    let userTypeFromCollection = col.slice(0, -1); // 'professionals' -> 'professional'
                    allPendingUsers.push({ id: doc.id, ...doc.data(), userType: doc.data().userType || userTypeFromCollection });
                });
                // totalPendingCount += snapshot.size; // This would be per-collection count if not limited
            }

            // Sort all pending users (e.g., by email or a timestamp if available and consistent)
            allPendingUsers.sort((a, b) => {
                const dateA = a.updatedAt?.toDate() || a.createdAt?.toDate() || new Date(0);
                const dateB = b.updatedAt?.toDate() || b.createdAt?.toDate() || new Date(0);
                return dateB - dateA; // Descending by date
            });

            totalPendingCount = allPendingUsers.length; // Total count of the combined list

            // For pagination of the combined list, if we fetched all:
            // const startIndex = (currentPage - 1) * limitCount;
            // const paginatedUsers = allPendingUsers.slice(startIndex, startIndex + limitCount);
            // lastFetchedDoc could be null or an indicator if more pages exist for client-side pagination.

            // For now, returning up to limitCount of the sorted combined list
            const paginatedUsers = allPendingUsers.slice(0, limitCount); 
            // This simplified pagination for pending means 'lastDoc' isn't directly from Firestore for the *next* combined page.

            return {
                users: paginatedUsers, // Return the first page of combined, sorted pending users
                lastDoc: allPendingUsers.length > limitCount ? true : null, // Indicates if there are more users than shown
                totalCount: totalPendingCount
            };

        } else if (userTypeFilterValue === 'professional') {
            console.log(`Fetching professionals. Options:`, options);
            let professionalQuery = db.collection('professionals');
            
            // This part remains for the main User Management tab when filtering by Professionals
             if (filters.length > 0) {
                filters.forEach(filter => {
                    if (filter.field !== 'userType' && filter.field !== 'search') { 
                        professionalQuery = professionalQuery.where(filter.field, filter.operator, filter.value);
                    }
                });
            }
            professionalQuery = professionalQuery.orderBy('isApproved', 'asc')
                                               .orderBy('updatedAt', 'desc');

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
            
            let totalProfessionalsCount = 0;
            let countQueryTotal = db.collection('professionals');
            if (filters.length > 0) {
                filters.forEach(filter => {
                    if (filter.field !== 'userType' && filter.field !== 'search') {
                         countQueryTotal = countQueryTotal.where(filter.field, filter.operator, filter.value);
                    }
                });
            }

            const totalCountSnapshot = await countQueryTotal.get();
            totalProfessionalsCount = totalCountSnapshot.size;

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

    const renderPendingApprovalTable = (users) => {
        const tableBody = document.getElementById('pending-approval-table')?.querySelector('tbody');
        if (!tableBody) {
            console.error("Element with ID 'pending-approval-table' and a tbody not found.");
            return;
        }
        tableBody.innerHTML = '';

        if (!users || users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">No pending user approvals found.</td></tr>'; // Increased colspan to 6
            return;
        }

        users.forEach(user => {
            // This function now expects users from professionals, clubs, or arenas
            // Ensure user.userType is correctly populated by fetchUsers
            const userTypeDisplay = user.userType ? user.userType.charAt(0).toUpperCase() + user.userType.slice(1) : 'Unknown';
            const displayName = user.businessName || user.clubName || user.arenaName || user.email || 'N/A';
            const isVerified = user.isVerified === true;
            const isApprovedForDisplay = user.isApproved === true; // Should be false for this table

            const row = tableBody.insertRow();
            row.dataset.userId = user.id;
            row.dataset.userType = user.userType; // Store userType for actions

            row.innerHTML = `
                <td>
                    <div>${displayName}</div>
                    <small class="text-muted">${user.email || 'N/A'}</small>
                </td>
                <td><span class="status-badge type-${user.userType || 'unknown'}">${userTypeDisplay}</span></td>
                <td><span class="status-badge status-${isVerified ? 'active' : 'inactive'}">${isVerified ? 'Yes' : 'No'}</span></td>
                <td><span class="status-badge status-${isApprovedForDisplay ? 'active' : 'pending'}">${isApprovedForDisplay ? 'Yes' : 'Pending'}</span></td>
                <td>${formatDate(user.createdAt || user.updatedAt)}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-success btn-approve-pending" 
                            data-id="${user.id}" 
                            data-usertype="${user.userType || 'unknown'}" 
                            title="Approve ${userTypeDisplay}">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn btn-sm btn-info view-details-btn" 
                            data-id="${user.id}" 
                            data-usertype="${user.userType || 'unknown'}" 
                            title="View Details">
                        <i class="fas fa-eye"></i> Details
                    </button>
                </td>
            `;
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
    const renderProfessionalBalanceTable = (entities) => { // Changed professionals to entities
        const tableBody = document.getElementById('professional-balance-table')?.querySelector('tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '';
        entities.forEach(entity => { // Changed pro to entity
            const row = tableBody.insertRow();
            const balanceValue = entity.balance;
            const balance = (typeof balanceValue === 'number') ? balanceValue : 0.0;
            const formattedBalance = balance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

            row.innerHTML = `
                <td>${entity.displayName || entity.id}</td>
                <td>${entity.email || 'N/A'}</td>
                <td>${formattedBalance}</td>
                <td class="actions">
                    <button class="view-payout-info-btn" 
                            data-id="${entity.id}" 
                            data-usertype="${entity.userType}" 
                            data-name="${entity.displayName || 'Entity'}" 
                            title="View Payout Info">
                        <i class="fas fa-university"></i>
                    </button>
                    <button class="mark-paid-btn" 
                            data-id="${entity.id}" 
                            data-usertype="${entity.userType}" 
                            data-name="${entity.displayName || 'Entity'}" 
                            data-balance="${balance}" 
                            title="Mark Balance as Paid" ${balance <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-money-check-alt"></i>
                    </button>
                </td>
            `;
        });
    };

    // --- New Function to Display Bank Details --- // Potentially adapt for arenas
    const displayPayoutInfo = (entityName, payoutInfo, entityType) => { // Added entityType
        const container = document.getElementById('payout-info-container');
        const contentDiv = document.getElementById('payout-info-content');
        const nameSpan = document.getElementById('selected-professional-payout-name'); // Consider renaming ID if generic
        if (!container || !contentDiv || !nameSpan) return;

        nameSpan.textContent = entityName;

        if (!payoutInfo || Object.keys(payoutInfo).length === 0) {
            contentDiv.innerHTML = `<p><em>No bank details found for this ${entityType}.</em></p>`;
        } else {
            contentDiv.innerHTML = formatDataForDisplay(payoutInfo); // formatDataForDisplay should be generic enough
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

    // --- Reported Ads Management Functions (New) ---
    const fetchReportedActivities = async (options = {}) => {
        console.log("Fetching reported activities with options:", options);
        const { filters = [], sortBy = 'reportCount', sortOrder = 'desc', limitCount = itemsPerPage, startAfterDoc = null } = options;

        let query = db.collection('activities').where('reportCount', '>', 0);

        // Apply additional filters if any (e.g., search, though search might be client-side for simplicity here)
        filters.forEach(filter => {
            if (filter.field && filter.operator && filter.value !== undefined) {
                query = query.where(filter.field, filter.operator, filter.value);
            }
        });

        // Apply sorting - default to reportCount descending
        if (sortBy) {
            query = query.orderBy(sortBy, sortOrder);
            // If sorting by a field other than reportCount, and reportCount is used in the primary where clause,
            // Firestore might require a composite index. For reportCount > 0, this orderBy should be fine.
            // If also ordering by timestamp for example (e.g. lastReportedAt), ensure `reportCount` is the first orderBy if not part of an equality filter.
            // Or, if `lastReportedAt` is always updated when `reportCount` is, sorting by `lastReportedAt` might be more relevant.
            // Let's assume for now `reportCount` is the primary sort, or `lastReportedAt` if specified.
            if (sortBy !== 'reportCount') { // Example: if primary sort is something else like 'lastReportedAt'
                 // query = query.orderBy('reportCount', 'desc'); // Ensure this doesn't conflict
            }
        }

        // Apply pagination start point
        if (startAfterDoc) {
            query = query.startAfter(startAfterDoc);
        }

        query = query.limit(limitCount);

        try {
            const snapshot = await query.get();
            const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

            // For total count, query without limit and pagination for accuracy based on the primary filter
            let countQuery = db.collection('activities').where('reportCount', '>', 0);
            filters.forEach(filter => {
                if (filter.field && filter.operator && filter.value !== undefined) {
                    countQuery = countQuery.where(filter.field, filter.operator, filter.value);
                }
            });
            const totalSnapshot = await countQuery.get();
            const totalCount = totalSnapshot.size; // .size provides the count of documents in the QuerySnapshot

            console.log(`Fetched ${activities.length} reported activities, total: ${totalCount}`);
            return { docs: activities, lastDoc, totalCount };

        } catch (error) {
            console.error("Error fetching reported activities:", error);
            showSnackbar("Error fetching reported activities.", "error");
            return { docs: [], lastDoc: null, totalCount: 0 };
        }
    };

    const renderReportedAdsTable = (activities) => {
        const tableBody = document.querySelector('#reported-ads-table tbody');
        if (!tableBody) {
            console.error('Reported ads table body not found!');
            return;
        }
        tableBody.innerHTML = ''; // Clear existing rows

        if (!activities || activities.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="placeholder-text">No reported ads found.</td></tr>';
            return;
        }

        activities.forEach(ad => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${ad.name || ad.id}</td>
                <td>${ad.reportCount || 0}</td>
                <td>${ad.lastReportedAt ? formatDateTime(ad.lastReportedAt) : 'N/A'}</td>
                <td>${ad.creatorId || 'Unknown'}</td>
                <td class="actions">
                    <button class="btn btn-small view-reported-ad-details-btn" data-id="${ad.id}" title="View Details"><i class="fas fa-eye"></i> View</button>
                    <button class="btn btn-small btn-danger delete-reported-ad-btn" data-id="${ad.id}" title="Delete Ad"><i class="fas fa-trash"></i> Delete</button>
                </td>
            `;
        });
    };

    // Function to fetch individual reports for an ad
    const fetchActivityReports = async (activityId) => {
        try {
            const reportsSnapshot = await db.collection('activities').doc(activityId).collection('reports').orderBy('timestamp', 'desc').get();
            if (reportsSnapshot.empty) {
                return [];
            }
            return reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error fetching reports for activity ${activityId}:`, error);
            showSnackbar("Error fetching report details.", "error");
            return [];
        }
    };

    // --- New Function to Format Activity Details for Modal ---
    const formatActivityDetailsForModal = (activity, reports) => {
        if (!activity) return '<p>Activity data not available.</p>';

        // Use helper functions for dates/times if they exist (like formatDate, formatDateTime)
        const formattedDateTime = activity.dateTime ? formatDateTime(activity.dateTime) : 'N/A';
        const creatorInfo = activity.creatorName ? `${activity.creatorName} (ID: ${activity.creatorId})` : activity.creatorId || 'Unknown';
        const levelDisplayName = activity.level?.displayName || activity.level || 'N/A'; // Adjust based on how level is stored
        const ageGroupDisplayName = activity.ageGroup?.displayName || activity.ageGroup || 'N/A'; // Adjust based on how ageGroup is stored
        const participantsText = `${activity.participants?.length ?? 0}/${activity.maxParticipants ?? 'N/A'}`;
        const priceText = activity.isPaid ? `${(activity.price ?? 0).toFixed(2)} €` : 'Gratuit';

        let reportsHtml = '<h4>Reports:</h4>';
        if (reports && reports.length > 0) {
            reportsHtml += '<ul style="list-style: disc; margin-left: 20px;">';
            reports.forEach(report => {
                reportsHtml += `<li style="margin-bottom: 8px;">
                    <strong>Reason:</strong> ${report.reason || 'Not specified'}<br>
                    <strong>Reporter:</strong> ${report.reporterId || 'Anonymous'} (UID: ${report.reporterUid || 'N/A'})<br>
                    <strong>Date:</strong> ${report.timestamp ? formatDateTime(report.timestamp) : 'N/A'}
                </li>`;
            });
            reportsHtml += '</ul>';
        } else {
            reportsHtml += '<p><em>No reports found for this activity.</em></p>';
        }

        // Structure HTML similar to Flutter page sections
        // Assuming .detail-item and .full-width classes exist and provide basic styling
        const htmlContent = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                <div class="detail-item"><strong>ID:</strong> ${activity.id}</div>
                <div class="detail-item"><strong>Name:</strong> ${activity.name || 'N/A'}</div>
                <div class="detail-item"><strong>Type:</strong> ${activity.type || 'N/A'}</div>
                <div class="detail-item"><strong>Date & Time:</strong> ${formattedDateTime}</div>
                <div class="detail-item"><strong>Location:</strong> ${activity.location || 'N/A'}</div>
                <div class="detail-item"><strong>Level:</strong> ${levelDisplayName}</div>
                <div class="detail-item"><strong>Age Group:</strong> ${ageGroupDisplayName}</div>
                <div class="detail-item"><strong>Participants:</strong> ${participantsText}</div>
                <div class="detail-item"><strong>Price:</strong> ${priceText}</div>
                <div class="detail-item"><strong>Creator:</strong> ${creatorInfo}</div>
                <div class="detail-item"><strong>Creator Type:</strong> ${activity.creatorType || 'N/A'}</div>
                <div class="detail-item"><strong>Report Count:</strong> ${activity.reportCount || 0}</div>
                <div class="detail-item full-width"><strong>Description:</strong><br>${activity.description || 'N/A'}</div>
                ${activity.equipment && activity.equipment.length > 0 ? `<div class="detail-item full-width"><strong>Equipment:</strong><br><ul><li>${activity.equipment.join('</li><li>')}</li></ul></div>` : ''}
            </div>
            <hr style="border-top: 1px solid var(--dark-border); margin: 20px 0;">
            ${reportsHtml}
        `;
        return htmlContent;
    };


    // --- New Function to Show Full Activity Details in Modal ---
    const showFullActivityDetailsModal = async (activityId) => {
        console.log(`Fetching full details for activity: ${activityId}`);
        try {
            // Fetch activity data
            const activityDoc = await db.collection('activities').doc(activityId).get();
            if (!activityDoc.exists) {
                showSnackbar(`Activity with ID ${activityId} not found.`, "error");
                return;
            }
            const activityData = { id: activityDoc.id, ...activityDoc.data() };

            // Fetch reports data
            const reportsData = await fetchActivityReports(activityId); // Use existing helper

            // Format the content
            const modalTitle = `Activity Details: ${activityData.name || activityId}`;
            const modalContentHtml = formatActivityDetailsForModal(activityData, reportsData);

            // Show the generic details modal
            showDetailsModal(modalTitle, modalContentHtml);

        } catch (error) {
            console.error("Error fetching or displaying full activity details:", error);
            showSnackbar("Failed to load activity details.", "error");
            // Optionally show the error in the modal itself
            showDetailsModal(`Error Loading Activity ${activityId}`, `<p style="color: var(--error-red);">Could not load details. Please check the console.</p>`);
        }
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
                    // if (proBalanceSearch) { // Client-side search was commented out, keeping it so
                    //     filters.push({ field: 'search', value: proBalanceSearch });
                    // }
                    // sortBy = 'balance'; // Default sort by balance descending
                    // sortOrder = 'desc'; // Default sort by balance descending // Commenting out default sort to apply after merging
                    currentCollection = 'financials'; // Meta-collection name for pagination/UI
                    
                    let allEntitiesWithBalance = [];
                    let lastProDoc = null;
                    let lastArenaDoc = null;
                    let totalProsWithBalance = 0;
                    let totalArenasWithBalance = 0;

                    // Fetch Professionals with balance
                    try {
                        const proFilters = []; 
                        if (proBalanceSearch) { 
                             proFilters.push({ field: 'search', type: 'professional', value: proBalanceSearch});
                        }
                        // --- Ensure only professionals with balance > 0 are fetched --- 
                        proFilters.unshift({ field: 'balance', operator: '>', value: 0 }); 

                        const { docs: professionals, lastDoc: proLD, totalCount: proTC } = await fetchData('professionals', { 
                            filters: proFilters, 
                            limitCount: itemsPerPage * 2, 
                            startAfterDoc: lastVisibleDoc 
                        });
                        professionals.forEach(p => allEntitiesWithBalance.push({...p, userType: 'professional', displayName: p.businessName || p.fullName || p.email || p.id }));
                        lastProDoc = proLD;
                        totalProsWithBalance = proTC; 
                    } catch (error) {
                        console.error("Error fetching professionals for balances:", error);
                    }

                    // Fetch Arenas with balance
                    try {
                        const arenaFilters = []; 
                         if (proBalanceSearch) { 
                             arenaFilters.push({ field: 'search', type: 'arena', value: proBalanceSearch});
                        }
                        // --- Ensure only arenas with balance > 0 are fetched --- 
                        arenaFilters.unshift({ field: 'balance', operator: '>', value: 0 });

                        const { docs: arenas, lastDoc: arenaLD, totalCount: arenaTC } = await fetchData('arenas', { 
                            filters: arenaFilters, 
                            limitCount: itemsPerPage * 2,
                            startAfterDoc: lastVisibleDoc 
                        });
                        arenas.forEach(a => allEntitiesWithBalance.push({...a, userType: 'arena', displayName: a.arenaName || a.email || a.id }));
                        lastArenaDoc = arenaLD;
                        totalArenasWithBalance = arenaTC;
                    } catch (error) {
                        console.error("Error fetching arenas for balances:", error);
                    }

                    // Client-side search (if proBalanceSearch is active and filters in fetchData are not sufficient)
                    if (proBalanceSearch) {
                        const query = proBalanceSearch.toLowerCase();
                        allEntitiesWithBalance = allEntitiesWithBalance.filter(e =>
                            (e.displayName?.toLowerCase().includes(query) || false) ||
                            (e.email?.toLowerCase().includes(query) || false)
                        );
                    }
                    
                    // Sort the combined list, e.g., by balance descending
                    allEntitiesWithBalance.sort((a, b) => (b.balance || 0) - (a.balance || 0));

                    // Basic pagination for the combined list (client-side for now)
                    const startIndex = (currentPage - 1) * itemsPerPage;
                    const paginatedEntities = allEntitiesWithBalance.slice(startIndex, startIndex + itemsPerPage);
                    
                    renderProfessionalBalanceTable(paginatedEntities); 
                    // lastVisibleDoc needs to be handled carefully for combined sources. 
                    // For simple client-side pagination of the combined list:
                    lastVisibleDoc = (startIndex + itemsPerPage < allEntitiesWithBalance.length) ? true : null;
                    totalItems = allEntitiesWithBalance.length; 
                    
                    document.getElementById('payout-info-container').style.display = 'none'; 
                    break;
                
                case 'boosted-announcements-management': // ADDED THIS CASE
                    console.log("loadSectionData: Case 'boosted-announcements-management' matched. Calling loadBoostedAnnouncementsData.");
                    await loadBoostedAnnouncementsData(); // Call the specific function
                    // Pagination for boosted announcements is not implemented yet, so we don't set currentCollection or totalItems here.
                    return; // Return early as boosted announcements handles its own pagination if any

                case 'pending-approval-management':
                    currentCollection = 'pending-approvals'; // Unique key for pagination
                    // Sorting is handled within fetchUsers for the combined pending list
                    const { users: pendingUsers, lastDoc: pendingLastDocIndicatesMore, totalCount: pendingTotal } = await fetchUsers({
                        fetchOnlyPending: true, 
                        limitCount: itemsPerPage, // Standard items per page
                        // startAfterDoc is not used here due to combined collection fetching complexity for pending
                    });
                    renderPendingApprovalTable(pendingUsers);
                    // For pending approvals, lastVisibleDoc is a boolean indicating if more might exist beyond the current fetch limit
                    lastVisibleDoc = pendingLastDocIndicatesMore; 
                    totalItems = pendingTotal;
                    break;

                case 'reported-ads-management': // New case
                    console.log("Loading Reported Ads Data");
                    currentCollection = 'reported-activities'; // Or a more descriptive name
                    currentPage = 1;
                    lastVisibleDoc = null;
                    const { docs: reportedActivities, lastDoc: reportedLastDoc, totalCount: reportedTotal } = await fetchReportedActivities({
                        limitCount: itemsPerPage,
                        // Potentially add sortBy: 'lastReportedAt', sortOrder: 'desc' later
                    });
                    renderReportedAdsTable(reportedActivities);
                    lastVisibleDoc = reportedLastDoc;
                    totalItems = reportedTotal;
                    updatePagination('reported-activities'); // Use a unique identifier for pagination
                    break;

                case 'sports-management': // New case for Sports
                    console.log("Loading Sports Data");
                    currentCollection = 'sports'; // Use collection name
                    // No pagination state needed for now
                    const { docs: sports, totalCount: sportsTotal } = await fetchSports();
                    renderSportsTable(sports);
                    // No pagination update needed
                    break;

                case 'settings':
                    // Add any additional settings-related logic you want to execute
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
                console.log(`Approve button clicked for user ${id} from user-table`);
                // For the main user table, we assume it's a professional if this button is active and it's not already approved.
                // This might need refinement if other user types get a direct approve button here.
                const userToApprove = await getUserData(id);
                if (userToApprove && userToApprove.userType === 'professional' && !userToApprove.isApproved) {
                    showConfirmation('Confirm Approval', `Are you sure you want to approve professional ${userToApprove.businessName || id}?`, () => {
                        approveUser(id, 'professional', 'user-management'); // Pass current section
                    });
                } else {
                    showSnackbar('User is not a pending professional or already approved.', 'info');
                }
                return; // Stop further processing for this click
            }

            // --- Approve User Action from Pending Tab --- (MODIFIED)
            if (targetButton.classList.contains('btn-approve-pending') && id && tableId === 'pending-approval-table') {
                e.stopPropagation();
                const userTypeToApprove = targetButton.dataset.usertype;
                const userNameToApprove = targetButton.closest('tr')?.querySelector('td:first-child div')?.textContent || id;
                if (!userTypeToApprove || userTypeToApprove === 'unknown') {
                    showSnackbar('Cannot determine user type for approval.', 'error');
                    return;
                }
                console.log(`Approve button clicked for user ${id} (type: ${userTypeToApprove}) from pending-approval-table`);
                showConfirmation('Confirm Approval', `Are you sure you want to approve ${userTypeToApprove} '${userNameToApprove}'?`, () => {
                    approveUser(id, userTypeToApprove, 'pending-approval-management'); 
                });
                return; 
            }

            // --- View Professional Details Action (for user-table and pending-approval-table) ---
            if (targetButton.classList.contains('view-details-btn') && id && 
                (tableId === 'user-table' || tableId === 'pending-approval-table')) {
                e.stopPropagation();
                console.log(`View details button clicked for user ${id} from table ${tableId}`);
                
                const fetchedUser = await getUserData(id); 
                
                if (fetchedUser) {
                    // Use generic display for all types in pending, and specific for professionals in user management if needed
                    if (tableId === 'pending-approval-table' || (fetchedUser.userType !== 'professional' && tableId === 'user-table')) {
                        const detailsHtml = formatDataForDisplay(fetchedUser);
                        showDetailsModal(`Details: ${fetchedUser.businessName || fetchedUser.clubName || fetchedUser.arenaName || fetchedUser.email || fetchedUser.id}`, detailsHtml);
                    } else if (fetchedUser.userType === 'professional') { // Specific display for professionals from user-table
                        const detailsHtml = populateProfessionalDetails(fetchedUser);
                        showDetailsModal(`Professional Details: ${fetchedUser.businessName || fetchedUser.email}`, detailsHtml);
                    } else {
                        const detailsHtml = formatDataForDisplay(fetchedUser); // Fallback generic display
                        showDetailsModal(`Details: ${fetchedUser.email || fetchedUser.id}`, detailsHtml);
                    }
                } else {
                    showDetailsModal('Error', '<p>Could not load details for this user.</p>');
                    console.error(`Failed to fetch user ${id} for details modal from table ${tableId}.`);
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
                 else if (tableId === 'sports-table') itemType = 'sport';

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
                        case 'sport': success = await firebaseDeleteSport(id); break;
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
                const entityName = targetButton.dataset.name || 'Entity';
                const entityType = targetButton.dataset.usertype;
                const payoutInfoContainer = document.getElementById('payout-info-container');
                const payoutInfoContent = document.getElementById('payout-info-content');

                if (!entityType) {
                    showSnackbar("Cannot determine entity type for payout info.", "error");
                    return;
                }

                if (payoutInfoContainer) {
                    document.getElementById('selected-professional-payout-name').textContent = entityName;
                    if (payoutInfoContent) payoutInfoContent.innerHTML = '<p>Loading payout info...</p>';
                    payoutInfoContainer.style.display = 'block';

                    try {
                        const collectionName = entityType === 'arena' ? 'arenas' : 'professionals';
                        const docSnap = await db.collection(collectionName).doc(id).get();
                        let bankDetails = {}; 
                        if (docSnap.exists) {
                            const data = docSnap.data() || {};
                            // Extract bank details - this might differ between professionals and arenas
                            // For now, using the same professional keys as a starting point
                            const relevantKeys = ['iban', 'bic', 'accountHolderName', 'bankName', 'bankAddress'];
                            for (const key of relevantKeys) {
                                if (data[key]) {
                                    bankDetails[key] = data[key];
                                }
                            }
                        } else {
                             console.warn(`${entityType} document ${id} not found when fetching bank details.`);
                        }
                        displayPayoutInfo(entityName, bankDetails, entityType);
                    } catch (error) {
                        console.error(`Error fetching bank details for ${entityType} ${id}:`, error);
                         if (payoutInfoContent) payoutInfoContent.innerHTML = '<p>Error loading bank details.</p>';
                    }
                } else {
                    console.error("Payout info container not found");
                }
            }
             // --- Mark Paid Action --- New
             else if (targetButton.classList.contains('mark-paid-btn') && id) {
                 e.stopPropagation();
                 const entityName = targetButton.dataset.name || 'Entity';
                 const entityType = targetButton.dataset.usertype;
                 const currentBalance = parseFloat(targetButton.dataset.balance || '0');
                 const formattedBalance = currentBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

                 if (!entityType) {
                    showSnackbar("Cannot determine entity type to mark as paid.", "error");
                    return;
                 }

                 if (currentBalance <= 0) {
                     alert('Balance is already zero or less. Cannot mark as paid.');
                     return;
                 }

                 showConfirmation(
                     `Confirm Payout for ${entityName}?`,
                     `Are you sure you want to mark the balance of ${formattedBalance} as paid? This will set the ${entityType}\'s balance to 0.00 €. `,
                     async () => {
                         console.log(`Attempting to mark ${entityType} ${id} as paid.`);
                         const success = await firebaseMarkBalancePaid(id, entityType);
                         if (success) {
                             alert(`${entityName} marked as paid. Their balance is now zero.`);
                             loadSectionData('professional-balances'); // Reload this specific section
                             const payoutContainer = document.getElementById('payout-info-container');
                             if (payoutContainer) payoutContainer.style.display = 'none';
                         } else {
                             alert(`Failed to mark ${entityName} as paid. Please check console for errors.`);
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
         const cancelBtn = document.getElementById('cancel-action-btn'); // Corrected ID

         // Check if buttons exist before cloning
         if (!confirmBtn || !cancelBtn) {
             console.error('Confirmation modal buttons not found! Check IDs: confirm-action-btn, cancel-action-btn');
             // Optionally close the modal or show an error to the user
             const modal = document.getElementById('confirmation-modal');
             if (modal) closeModal(modal);
             alert('An error occurred displaying the confirmation dialog.');
             return;
         }

         // Clone nodes to remove previous listeners
         const newConfirmBtn = confirmBtn.cloneNode(true);
         confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
         const newCancelBtn = cancelBtn.cloneNode(true);
         cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

         // Add new listeners
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

    // --- New Firebase function to mark as paid --- // MODIFIED
    const firebaseMarkBalancePaid = async (entityId, entityType) => {
        console.log(`Marking ${entityType} ${entityId} as paid (setting balance to 0)`);
        if (!entityId || !entityType) {
            console.error("Missing entityId or entityType for firebaseMarkBalancePaid");
            return false;
        }
        
        let collectionName = '';
        if (entityType === 'professional') {
            collectionName = 'professionals';
        } else if (entityType === 'arena') {
            collectionName = 'arenas';
        } else {
            console.error(`Unsupported entityType: ${entityType} for firebaseMarkBalancePaid`);
            return false;
        }

        const entityRef = db.collection(collectionName).doc(entityId);
        try {
            await entityRef.update({ balance: 0, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); // Added updatedAt
            console.log(`Successfully set balance to 0 for ${entityType} ${entityId}`);
            return true;
        } catch (error) {
            console.error(`Error updating balance for ${entityType} ${entityId}:`, error);
            return false;
        }
    };

    // MODIFIED: Renamed and generalized from approveProfessionalUser
    const approveUser = async (userId, userType, sectionToReload = 'user-management') => {
        console.log(`Attempting to approve ${userType} user: ${userId}, will reload ${sectionToReload}`);
        
        let collectionPath = '';
        switch (userType) {
            case 'professional':
                collectionPath = 'professionals';
                break;
            case 'club':
                collectionPath = 'clubs';
                break;
            case 'arena':
                collectionPath = 'arenas';
                break;
            default:
                showSnackbar(`Unknown user type: ${userType} for approval.`, 'error');
                console.error(`Unknown user type: ${userType} for approval of user ${userId}.`);
                return false;
        }

        const userRef = db.collection(collectionPath).doc(userId);
        try {
            await userRef.update({
                isApproved: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Successfully approved ${userType} user: ${userId} in collection ${collectionPath}`);
            // Reload data for the section to reflect changes
            currentPage = 1; 
            lastVisibleDoc = null;
            loadSectionData(sectionToReload); 
            showSnackbar(`${userType.charAt(0).toUpperCase() + userType.slice(1)} approved successfully!`, 'success');
            return true;
        } catch (error) {
            console.error(`Error approving ${userType} user ${userId} in ${collectionPath}:`, error);
            showSnackbar(`Error approving ${userType}. See console for details.`, 'error');
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

    // Event delegation for action buttons in tables
    if (mainContentArea) {
        mainContentArea.addEventListener('click', async (event) => {
            const target = event.target.closest('button');
            if (!target) return;

            const userId = target.dataset.id;
            const professionalId = target.dataset.id; // For pro balances
            const activityId = target.dataset.id;
            const eventId = target.dataset.id;
            const clubId = target.dataset.clubId; // For club-specific actions
            const teamId = target.dataset.teamId;
            const arenaId = target.dataset.arenaId;
            const facilityId = target.dataset.facilityId;
            const facilityArenaId = target.dataset.arenaId; // Used when adding/editing facility from arena context
            const conversationId = target.dataset.id;
            const bookingId = target.dataset.id;

            // ... (existing event handling like delete user, approve user etc.)

            // Reported Ads Table Actions
            if (target.classList.contains('view-reported-ad-details-btn')) {
                if (activityId) {
                    console.log("View reported ad details for:", activityId);
                    await showFullActivityDetailsModal(activityId);
                }
            }

            if (target.classList.contains('delete-reported-ad-btn')) {
                if (activityId) {
                    showConfirmation('Delete Reported Ad', 'Are you sure you want to permanently delete this ad? This action cannot be undone.', async () => {
                        console.log("Confirmed deletion for ad:", activityId);
                        await firebaseDeleteActivity(activityId); // Assumes firebaseDeleteActivity handles UI update or snackbar
                        showSnackbar('Ad deleted successfully.', 'success');
                        // Refresh the reported ads list
                        if (getActiveSectionId() === 'reported-ads-management') {
                            await loadSectionData('reported-ads-management');
                        }
                    });
                }
            }

            // ... (other existing event handlers)
        });
    }

    // Event listener for the delete button INSIDE the reported ad details modal
    if (deleteAdBtnInModal) {
        deleteAdBtnInModal.addEventListener('click', () => {
            const adId = deleteAdBtnInModal.dataset.id;
            if (adId) {
                showConfirmation('Delete Reported Ad', 'Are you sure you want to permanently delete this ad from the modal? This action cannot be undone.', async () => {
                    console.log("Confirmed deletion from modal for ad:", adId);
                    await firebaseDeleteActivity(adId);
                    closeModal(reportedAdDetailsModal);
                    showSnackbar('Ad deleted successfully.', 'success');
                    // Refresh the reported ads list
                    if (getActiveSectionId() === 'reported-ads-management') {
                        await loadSectionData('reported-ads-management');
                    }
                });
            }
        });
    }

    // Initialize first section
    loadSectionData('dashboard-overview'); // Load overview data initially

    // --- Sports Management Functions (New) ---
    const fetchSports = async (options = {}) => {
        console.log("Fetching sports");
        // Basic fetch, might add sorting/filtering later if needed
        const { sortBy = 'name', sortOrder = 'asc' } = options;
        try {
            let query = db.collection('sports').orderBy(sortBy, sortOrder);
            const snapshot = await query.get();
            const sports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Fetched ${sports.length} sports`);
            // No pagination for now, return all
            return { docs: sports, totalCount: sports.length };
        } catch (error) {
            console.error("Error fetching sports:", error);
            showSnackbar("Error fetching sports list.", "error");
            return { docs: [], totalCount: 0 };
        }
    };

    const renderSportsTable = (sports) => {
        const tableBody = document.querySelector('#sports-table tbody');
        if (!tableBody) {
            console.error('Sports table body not found!');
            return;
        }
        tableBody.innerHTML = ''; // Clear existing rows

        if (!sports || sports.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="placeholder-text">No sports found. Add some!</td></tr>';
            return;
        }

        sports.forEach(sport => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${sport.name || 'Unnamed Sport'}</td>
                <td>${sport.createdAt ? formatDate(sport.createdAt) : 'N/A'}</td>
                <td class="actions">
                    <button class="btn btn-small btn-danger delete-btn" data-id="${sport.id}" data-name="${sport.name || 'this sport'}" title="Delete Sport"><i class="fas fa-trash"></i></button>
                </td>
            `;
        });
    };

    const firebaseAddSport = async (sportName) => {
        if (!sportName || sportName.trim() === '') {
            showSnackbar("Sport name cannot be empty.", "error");
            return false;
        }
        console.log(`Adding sport: ${sportName}`);
        try {
            // Optional: Check if sport already exists (case-insensitive)
            const existingSportQuery = await db.collection('sports')
                                             .where('nameLower', '==', sportName.trim().toLowerCase())
                                             .limit(1).get();
            if (!existingSportQuery.empty) {
                showSnackbar(`Sport "${sportName}" already exists.`, "error");
                return false;
            }

            await db.collection('sports').add({
                name: sportName.trim(),
                nameLower: sportName.trim().toLowerCase(), // For case-insensitive checks
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showSnackbar(`Sport "${sportName}" added successfully.`, "success");
            return true;
        } catch (error) {
            console.error("Error adding sport:", error);
            showSnackbar("Failed to add sport.", "error");
            return false;
        }
    };

    const firebaseDeleteSport = async (sportId) => {
        console.log(`Deleting sport ${sportId}`);
        try {
            await db.collection('sports').doc(sportId).delete();
            showSnackbar("Sport deleted successfully.", "success");
            return true;
        } catch (error) {
            console.error("Error deleting sport:", error);
            showSnackbar("Failed to delete sport.", "error");
            return false;
        }
    };

    // --- Add Sport Button Listener ---
    if (addSportBtn && newSportNameInput) {
        addSportBtn.addEventListener('click', async () => {
            console.log('[DEBUG] Add Sport Button Clicked. Value of newSportNameInput.value:', newSportNameInput.value); // Added for debugging
            const sportName = newSportNameInput.value;
            const success = await firebaseAddSport(sportName);
            if (success) {
                newSportNameInput.value = ''; // Clear input
                if (getActiveSectionId() === 'sports-management') {
                    await loadSectionData('sports-management'); // Reload list
                }
            }
        });
        // Optional: Add listener for Enter key in input field
        newSportNameInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                 console.log('[DEBUG] Enter Key Pressed in Sport Input. Value of newSportNameInput.value:', newSportNameInput.value); // Added for debugging
                 const sportName = newSportNameInput.value;
                 const success = await firebaseAddSport(sportName);
                 if (success) {
                    newSportNameInput.value = ''; // Clear input
                     if (getActiveSectionId() === 'sports-management') {
                        await loadSectionData('sports-management'); // Reload list
                    }
                 }
            }
        });
    }

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
