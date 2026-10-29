import Image from "next/image"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface ProjectCardProps {
  name: string
  image: string
  personName: string
  role: string
  bgColor: string
}

export function ProjectCard({ name, image, personName, role, bgColor }: ProjectCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-gray-800 bg-gray-950">
      <div className="relative aspect-[9/16] w-full overflow-hidden">
        <Image
          src={image || "/placeholder.svg"}
          alt={`${name} project screenshot`}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
        <div className={`mb-2 inline-flex rounded-md px-3 py-1 text-sm font-medium ${bgColor} text-black`}>{name}</div>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-white">
            <AvatarFallback>{personName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-white">{personName}</p>
            <p className="text-sm text-gray-400">{role}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

