<script setup>
import { onMounted } from 'vue';
import { useAuth } from './store/auth';
import Navbar from './components/Navbar.vue';

const auth = useAuth();

onMounted(async () => {
  await auth.initAuth();
});
</script>

<template>
  <div class="app-root">
    <Navbar />
    <router-view />
  </div>
</template>

<style>
.app-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
</style>
