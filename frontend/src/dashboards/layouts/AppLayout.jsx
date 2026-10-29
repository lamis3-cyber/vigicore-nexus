import { useCallback, useEffect, useRef, useState } from 'react';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import ChatPanel from '../components/ChatPanel';
import { AI_CHAT_CONFIG, DASHBOARD_ID_BY_ROLE, PROFILE_ID_BY_ROLE, getChatGreetingName, getPortalKey } from '../config/navConfig';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getLang, tr } from '../../i18n/translate.js';
import { useToast } from '../context/ToastContext';
import { useQueueAlerts } from '../lib/useQueueAlerts';

// The ONE shell every role's dashboard renders inside.
// Old HTML: topbar/sidebar/chat markup was duplicated (with data-scope
// switches) once per role, all sitting in the DOM at the same time.
// Here: one shell, `portalKey` picks the right nav + chat config,
// `children` is whatever page content that role is currently viewing.
//
// `portalKey` (role/org/department refactor, navConfig.js's
// getPortalKey) — NOT `user.role` directly — is what every lookup
// below uses: for most roles it's identical to the role, but for
// 'vigilance_responsible'/'administrator' it also carries which
// organization type the account belongs to, so the CHU/Clinique/
// Centre Médical dashboards (each still their own implementation,
// see navConfig.js's header) get selected correctly.
export default function AppLayout({ activeNavId, onNavSelect, children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const loadedHistory = useRef(false);
  const chatSeq = useRef(0); // identifie la discussion en cours : une réponse tardive d'une ancienne discussion est ignorée

  const portalKey = getPortalKey(user);
  // Notifications de la file d'établissement (responsable vigilance, administrateur) : une seule lecture pour la barre et le menu.
  const toast = useToast();
  const queueUnread = useQueueAlerts(/-(qualite|admin)$/.test(String(portalKey || '')), toast);
  const chatCfg = AI_CHAT_CONFIG[portalKey] || AI_CHAT_CONFIG[user.role];

  // Historique enregistré sur le compte : à la première ouverture on reprend la dernière discussion.
  const api = useCallback(async (path, init) => {
    const res = await fetch(`/api/assistant${path}`, { credentials: 'include', ...init });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) throw new Error(data?.message || 'error');
    return data;
  }, []);
  const toMessages = (rows) => rows.map((m) => ({ from: m.from, text: m.text, ts: new Date(m.ts) }));
  const refreshConversations = useCallback(async () => {
    try { setConversations((await api('/conversations')).conversations); } catch { /* historique indisponible : le chat reste utilisable */ }
  }, [api]);
  useEffect(() => {
    if (!chatOpen || loadedHistory.current) return;
    loadedHistory.current = true;
    (async () => {
      try {
        const list = (await api('/conversations')).conversations;
        setConversations(list);
        if (list.length && chatSeq.current === 0) {
          const seq = chatSeq.current;
          const d = await api(`/conversations/${list[0].id}`);
          if (seq === chatSeq.current) { setMessages(toMessages(d.messages)); setConversationId(list[0].id); }
        }
      } catch { loadedHistory.current = false; }
    })();
  }, [chatOpen, api]);

  function handleNewChat() {
    chatSeq.current += 1;
    setMessages([]);
    setConversationId(null);
    setIsTyping(false);
  }

  async function handleOpenConversation(id) {
    chatSeq.current += 1;
    const seq = chatSeq.current;
    setIsTyping(false);
    try {
      const d = await api(`/conversations/${id}`);
      if (seq !== chatSeq.current) return;
      setMessages(toMessages(d.messages));
      setConversationId(id);
    } catch { /* garde l'affichage actuel */ }
  }

  async function handleDeleteConversation(id) {
    try { await api(`/conversations/${id}`, { method: 'DELETE' }); } catch { return; }
    setConversations((list) => list.filter((c) => c.id !== id));
    if (id === conversationId) handleNewChat();
  }

  async function handleSend(text) {
    const seq = chatSeq.current;
    setMessages((m) => [...m, { from: 'user', text, ts: new Date() }]);
    setIsTyping(true);
    let reply;
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, lang: getLang(), ...(conversationId ? { conversationId } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && typeof data.reply === 'string') {
        reply = data.reply;
        if (seq === chatSeq.current && data.conversationId) { setConversationId(data.conversationId); refreshConversations(); }
      }
      else if (res.status === 401) reply = tr('Votre session a expiré. Reconnectez-vous pour continuer.');
      else reply = tr(data?.message) || tr('Le service est momentanément indisponible. Réessayez dans un instant.');
    } catch {
      reply = tr('Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.');
    }
    if (seq !== chatSeq.current) return; // l'utilisateur a ouvert une nouvelle discussion entre-temps
    setIsTyping(false);
    setMessages((m) => [...m, { from: 'ai', text: reply, ts: new Date() }]);
  }

  return (
    <div className="app-shell">
      <Topbar
        portalKey={portalKey}
        userName={user.name}
        userInitials={user.initials}
        theme={theme}
        user={user}
        onNavigate={onNavSelect}
        onToggleSidebar={() => {}}
        onGoDashboard={() => onNavSelect(DASHBOARD_ID_BY_ROLE[portalKey] || DASHBOARD_ID_BY_ROLE[user.role])}
        onOpenAlerts={(view) => onNavSelect(view)}
        activeId={activeNavId}
        queueUnread={queueUnread}
        onToggleTheme={toggleTheme}
        onLogout={logout}
        onOpenProfile={() => onNavSelect(PROFILE_ID_BY_ROLE[portalKey] || PROFILE_ID_BY_ROLE[user.role] || 'profil')}
      />

      <Sidebar
        portalKey={portalKey}
        activeId={activeNavId}
        onSelect={onNavSelect}
        onOpenChat={() => setChatOpen(true)}
        queueUnread={queueUnread}
      />
      <main className="main-content">{children}</main>

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        title={chatCfg?.title}
        greetingName={getChatGreetingName(user)}
        description={chatCfg?.description}
        disclaimer={chatCfg?.disclaimer}
        suggestions={chatCfg?.suggestions}
        messages={messages}
        isTyping={isTyping}
        onSend={handleSend}
        onNewChat={handleNewChat}
        conversations={conversations}
        activeConversationId={conversationId}
        onOpenConversation={handleOpenConversation}
        onDeleteConversation={handleDeleteConversation}
      />
    </div>
  );
}
