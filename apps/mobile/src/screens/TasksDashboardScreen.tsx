import { ScrollView, Text, TouchableOpacity, View } from 'react-native'

type Props = {
  onSignOut: () => void
  onViewTasks: () => void
  onViewReminders: () => void
  onCreateTask: () => void
}

export default function TasksDashboardScreen({
  onSignOut,
  onViewTasks,
  onViewReminders,
  onCreateTask,
}: Props) {
  return (
    <View className="flex-1 bg-[#1f2937]">
      <ScrollView className="flex-1 px-5 pt-12" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="mb-6 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-yellow-400">
              <Text className="text-2xl">🐝</Text>
            </View>

            <View>
              <Text className="text-2xl font-black text-white">BeePlan</Text>
              <Text className="text-sm text-slate-400">Good morning, Fatima 👋</Text>
            </View>
          </View>

          <View className="flex-row gap-2">
            <TouchableOpacity className="rounded-2xl bg-white/10 px-4 py-3">
              <Text className="text-white">☀️</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onSignOut} className="rounded-2xl bg-yellow-400 px-4 py-3">
              <Text className="font-bold text-black">Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mb-5 rounded-2xl bg-white/10 px-5 py-4">
          <Text className="text-slate-400">🔍 Search tasks...</Text>
        </View>

        <View className="mb-5 flex-row flex-wrap justify-between gap-y-4">
          <StatCard icon="📅" value="8" title="Today's Tasks" />
          <StatCard icon="✅" value="24" title="Completed" />
          <StatCard icon="🚩" value="3" title="High Priority" />
          <StatCard icon="⏰" value="2" title="Overdue" />
        </View>

        <View className="mb-5 rounded-3xl bg-white/10 p-5">
          <View className="mb-4 flex-row items-center justify-between">
            <View>
              <Text className="text-lg font-bold text-white">Overall Progress</Text>
              <Text className="text-sm text-slate-400">You're doing great! Keep it up.</Text>
            </View>

            <View className="h-16 w-16 items-center justify-center rounded-full border-4 border-yellow-400">
              <Text className="font-black text-yellow-400">64%</Text>
            </View>
          </View>

          <View className="h-3 rounded-full bg-slate-700">
            <View className="h-3 w-[64%] rounded-full bg-yellow-400" />
          </View>

          <View className="mt-3 flex-row justify-between">
            <Text className="text-sm text-slate-400">24 completed</Text>
            <Text className="text-sm text-slate-400">32 total tasks</Text>
          </View>
        </View>

        <View className="mb-5 rounded-3xl bg-white/10 p-5">
          <View className="mb-5 flex-row justify-between">
            <Text className="font-bold text-white">Today's Focus</Text>
            <TouchableOpacity onPress={onViewTasks}>
              <Text className="font-bold text-yellow-400">View All ›</Text>
            </TouchableOpacity>
          </View>

          <FocusTask title="Finalize Q3 marketing strategy" time="10:00 AM" color="bg-red-400" />
          <FocusTask title="Review design mockups for mobile app" time="1:30 PM" color="bg-orange-400" />
          <FocusTask title="Team sync — weekly standup" time="9:00 AM" color="bg-yellow-400" done />
          <FocusTask title="Update project documentation" time="4:00 PM" color="bg-slate-400" />
        </View>

        <View className="rounded-3xl bg-white/10 p-5">
          <Text className="mb-4 font-bold text-white">Quick Actions</Text>

          <View className="gap-3">
            <ActionCard icon="➕" title="New Task" desc="Create a new task" onPress={onCreateTask} />
            <ActionCard icon="🔔" title="New Reminder" desc="Add a reminder" onPress={onViewReminders} />
            <ActionCard icon="📅" title="View Calendar" desc="See your schedule" />
            <ActionCard icon="📂" title="All Tasks" desc="View all tasks" onPress={onViewTasks} />
          </View>
        </View>
      </ScrollView>

      <TouchableOpacity
        onPress={onCreateTask}
        className="absolute bottom-24 right-6 h-16 w-16 items-center justify-center rounded-3xl bg-yellow-400 shadow-xl"
      >
        <Text className="text-3xl font-bold text-black">+</Text>
      </TouchableOpacity>

      <View className="absolute bottom-4 left-5 right-5 flex-row items-center justify-around rounded-3xl bg-[#111827] py-4">
        <NavItem active icon="▦" label="Dashboard" />
        <NavItem icon="☑" label="Tasks" onPress={onViewTasks} />
        <NavItem icon="🔔" label="Reminders" onPress={onViewReminders} />
        <NavItem icon="📅" label="Calendar" />
        <NavItem icon="👤" label="Profile" />
      </View>
    </View>
  )
}

function StatCard({ icon, value, title }: { icon: string; value: string; title: string }) {
  return (
    <View className="w-[48%] rounded-3xl bg-white/10 p-5">
      <Text className="mb-4 text-2xl">{icon}</Text>
      <Text className="text-3xl font-black text-white">{value}</Text>
      <Text className="mt-2 font-bold text-white">{title}</Text>
    </View>
  )
}

function FocusTask({
  title,
  time,
  color,
  done,
}: {
  title: string
  time: string
  color: string
  done?: boolean
}) {
  return (
    <View className="mb-4 flex-row items-center gap-4">
      <View className={`h-5 w-5 rounded-full border ${done ? 'border-yellow-400 bg-yellow-400' : 'border-slate-500'}`} />
      <View className="flex-1">
        <Text className={`font-semibold ${done ? 'text-slate-500 line-through' : 'text-white'}`}>{title}</Text>
        <Text className="text-sm text-slate-400">{time}</Text>
      </View>
      <View className={`h-2 w-2 rounded-full ${color}`} />
    </View>
  )
}

function ActionCard({
  icon,
  title,
  desc,
  onPress,
}: {
  icon: string
  title: string
  desc: string
  onPress?: () => void
}) {
  return (
    <TouchableOpacity onPress={onPress} className="rounded-2xl bg-white/10 p-4">
      <Text className="mb-2 text-2xl">{icon}</Text>
      <Text className="font-bold text-white">{title}</Text>
      <Text className="text-sm text-slate-400">{desc}</Text>
    </TouchableOpacity>
  )
}

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string
  label: string
  active?: boolean
  onPress?: () => void
}) {
  return (
    <TouchableOpacity onPress={onPress} className="items-center">
      <Text className="text-xl">{icon}</Text>
      <Text className={`text-xs font-bold ${active ? 'text-yellow-400' : 'text-slate-400'}`}>{label}</Text>
    </TouchableOpacity>
  )
}