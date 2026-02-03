<script lang="ts">
  import Router from 'svelte-spa-router';
  import Nav from './lib/Nav.svelte';
  import Home from './pages/Home.svelte';
  import Week from './pages/Week.svelte';
  import Recepten from './pages/Recepten.svelte';
  import ReceptDetail from './pages/ReceptDetail.svelte';
  import Geschiedenis from './pages/Geschiedenis.svelte';
  import Importeren from './pages/Importeren.svelte';
  import Instellingen from './pages/Instellingen.svelte';
  import Boodschappen from './pages/Boodschappen.svelte';

  const routes = {
    '/': Home,
    '/week': Week,
    '/recepten': Recepten,
    '/recepten/:id': ReceptDetail,
    '/geschiedenis': Geschiedenis,
    '/importeren': Importeren,
    '/instellingen': Instellingen,
    '/boodschappen': Boodschappen,
  };
</script>

<div class="min-h-screen bg-gray-50 overflow-x-hidden">
  <Nav />
  <main class="container mx-auto px-4 py-8 max-w-6xl">
    <Router {routes} />
  </main>
</div>
