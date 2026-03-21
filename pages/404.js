import Navbar from '../src/components/Navbar';

export default function Custom404() {
  return (
    <div>
        <Navbar />
        <h1>404 - Page Not Found</h1>
        <p className="text-center text-4xl">Sorry, the page you are looking for does not exist.</p>
    </div>
  );
}