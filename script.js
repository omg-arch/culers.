document.addEventListener('DOMContentLoaded', () => {
    // Qaybta Hamburger Menu-ga iyo Sidebar-ka
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mainNav = document.getElementById('mainNav'); // ID-gan wuxuu qabanayaa <nav class="sidebar">
    const overlay = document.getElementById('overlay');

    if (hamburgerBtn && mainNav && overlay) {
        hamburgerBtn.addEventListener('click', () => {
            mainNav.classList.toggle('open'); // Ku dar ama ka saar 'open' class-ka sidebar-ka
            overlay.classList.toggle('active'); // Muuji ama qarso overlay-ga
            document.body.classList.toggle('no-scroll'); // Ka hortag scrolling-ka jirka
        });

        // Xir sidebar-ka marka la riixo overlay-ga
        overlay.addEventListener('click', () => {
            mainNav.classList.remove('open');
            overlay.classList.remove('active');
            document.body.classList.remove('no-scroll');
        });

        // Xir sidebar-ka marka la riixo link ku dhex jira
        mainNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (mainNav.classList.contains('open')) {
                    mainNav.classList.remove('open');
                    overlay.classList.remove('active');
                    document.body.classList.remove('no-scroll');
                }
            });
        });
    }

    // Qaybaha kale ee Muhiimka ah ee Navigashanka
    const loggedInUser = sessionStorage.getItem('loggedInUser'); // Hel user-ka soo galay

    // Logout Button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('loggedInUser'); // Ka saar user-ka session-ka
            window.location.href = 'login.html'; // U gudbi bogga login-ka
        });
    }

    // Link-ga Profile-ka (oo u gudbinaya bogga profile-ka ee user-ka soo galay)
    const profileNavLink = document.getElementById('profile-link'); // Hubi in HTML-kaagu leeyahay id="profile-link"
    if (profileNavLink) {
        profileNavLink.addEventListener('click', (e) => {
            e.preventDefault(); // Jooji dhaqanka caadiga ah ee link-ga
            if (loggedInUser) {
                window.location.href = `profile.html?user=${loggedInUser}`; // U gudbi bogga profile-ka
            } else {
                window.location.href = 'login.html'; // Haddii uusan user jirin, u gudbi login
            }
        });
    }

    // Links-yada kale ee navigashanka (Home, Post, Explore, Messages, Live Chat, Notifications)
    // Waxaad halkan ku dari kartaa logic-gooda, laakiin haddii ay yihiin links to pages
    // sida <a href="messages.html">, uma baahna JavaScript gaar ah.
    // Haddii ay jiraan "showHome()", "showPost()" functions oo aad doonayso in ay JavaScript ka maamulato,
    // waa inaad halkaan ku qortaa ama aad ku hubisaa in ay ku jiraan faylka script.js
    //
    // Tusaale ahaan, haddii 'Post' uu furayo modal (sida ku jirta HTML-kii hore), waa inaad qabataa link-ka:
    const createPostLink = document.getElementById('post-link');
    const newPostModal = document.getElementById('newPostModal');
    const closePostBtn = newPostModal ? newPostModal.querySelector('.close-button') : null; // Close button for the modal

    if (createPostLink && newPostModal) {
        createPostLink.addEventListener('click', (e) => {
            e.preventDefault();
            newPostModal.style.display = 'block'; // Muuji modal-ka
        });

        if (closePostBtn) {
            closePostBtn.addEventListener('click', () => {
                newPostModal.style.display = 'none'; // Qarso modal-ka
            });
        }
        // Xir modal-ka markii meel ka baxsan la riixo
        window.addEventListener('click', (event) => {
            if (event.target == newPostModal) {
                newPostModal.style.display = 'none';
            }
        });
    }
});