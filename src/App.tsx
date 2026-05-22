import { DottedGlobe } from './components/DottedGlobe';

export default function App() {
  return (
    <div className="app">
      <header className="app__top">
        <button className="app__cta" type="button">Get In Touch</button>
      </header>
      <div className="app__globe">
        <DottedGlobe />
      </div>
    </div>
  );
}
