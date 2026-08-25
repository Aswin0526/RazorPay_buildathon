import React, { useState } from 'react';
import '../styles/Customerdash.css';
import CHome from '../components/CHome';
import Corder from '../components/Corder';
import Custorders from '../components/Custorders';
import Chat from '../components/Chat';
import CUpdate from '../components/CUpdate';
import Voice from '../components/Voice';
import TextChat from './TextChat';
import Needed from './Needed';

function Customerdash() {
  const custData = JSON.parse(localStorage.getItem('user_data'));
  const [activeTab, setActiveTab] = useState('Home');
  const [showChat, setShowChat] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showTextChat, setShowTextChat] = useState(false);

  const handleVoiceOpen = () => {
    setShowChat(false);
    setShowTextChat(false);
    setShowVoice(true);
  };

  const handleTextChatOpen = () => {
    setShowChat(false);
    setShowVoice(false);
    setShowTextChat(true);
    setActiveTab('Chat');
  };

  const handleChatClose = () => {
    setShowChat(false);
    setActiveTab('Home');
  };

  const handleTextChatClose = () => {
    setShowTextChat(false);
    setActiveTab('Home');
  };

  const handleVoiceClose = () => {
    setShowVoice(false);
    setActiveTab('Home');
  };

  return (
    <div className="container">
      <header className="header">
        <div className="header-left">
          <div className="user-logo">C</div>
          <div className="user-info">
            {custData?.customer_name || 'Undefined'}
          </div>
        </div>

        <nav className="nav">
          {['Home', 'WishList', 'Orders', 'Update', 'Needed'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'nav-link active' : 'nav-link'}
              onClick={() => {
                setActiveTab(tab);
                setShowChat(false);
              }}
            >
              {tab}
            </button>
          ))}
          <button
            className={showChat ? 'nav-link active' : 'nav-link'}
            onClick={() => {
              setShowChat(true);
              setActiveTab('Chat');
            }}
          >
            Chat
          </button>
        </nav>
      </header> 

      <main>
        {activeTab === 'Home' && !showChat && <CHome custData={custData} />}
        {activeTab === 'WishList' && !showChat && <Corder custData={custData} />}
        {activeTab === 'Orders' && !showChat && <Custorders custData={custData} />}
        {activeTab === 'Needed' && !showChat && <Needed custData={custData} />}
        {activeTab === 'Chat' && showChat && (
          <Chat
            custData={custData}
            onClose={handleChatClose}
            onVoiceOpen={handleVoiceOpen}
            onTextOpen={handleTextChatOpen}
          />
        )}
        {showTextChat && <TextChat onClose={handleTextChatClose} isPage={true} />}
        {showVoice && <Voice onClose={handleVoiceClose} />}
        {activeTab === 'Update' && !showChat && <CUpdate custData={custData} />}
      </main>
    </div>
  );
}

export default Customerdash;

