import { createRouter, createWebHistory } from 'vue-router'
import Form1 from '../views/Form1.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'form1',
      component: Form1,
    },
    {
      path: '/form2',
      name: 'form2',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/Form2.vue'),
    },
  ],
})

export default router
